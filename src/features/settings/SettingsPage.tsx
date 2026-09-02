"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Bell, Download, HardDrive, Smartphone, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Card, ConfirmDialog, Field, InlineError, InlineInfo, Input, Modal, PageHeader, SectionTitle, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { db } from "@/db/db";
import { ensureInitialized, updateSettings } from "@/db/seed";
import type { Theme } from "@/domain/types";
import { useSettings } from "@/hooks/useSettings";
import { formatDateTime } from "@/lib/dates";
import { downloadBlob } from "@/lib/download";
import { backupFileName, exportJsonBackup, exportZipBackup, parseBackupFile, resetAllData, restoreBackup, type ParsedBackup } from "@/services/backup";
import { storageUsage } from "@/services/courses";
import { formatFileSize } from "@/services/import/extract";
import { armInPageNotifications, getSupport, registerPeriodicSync, requestPermission, sendTestNotification, type NotificationSupport } from "@/services/notifications";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function SettingsPage() {
  const settings = useSettings();
  const toast = useToast();
  const [name, setName] = useState(settings.userName);
  const [year, setYear] = useState(settings.schoolYear);
  const [support, setSupport] = useState<NotificationSupport | null>(() => (typeof window === "undefined" ? null : getSupport()));
  const [seen, setSeen] = useState({ userName: settings.userName, schoolYear: settings.schoolYear });
  if (seen.userName !== settings.userName || seen.schoolYear !== settings.schoolYear) {
    setSeen({ userName: settings.userName, schoolYear: settings.schoolYear });
    setName(settings.userName);
    setYear(settings.schoolYear);
  }
  const [periodic, setPeriodic] = useState<string | null>(null);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [backupBusy, setBackupBusy] = useState<"json" | "zip" | null>(null);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const usage = useLiveQuery(() => storageUsage(), []);
  const lastRestore = useLiveQuery(() => db.meta.get("lastRestore"), []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const toggleNotifications = async (enabled: boolean) => {
    if (enabled) {
      const permission = await requestPermission();
      setSupport(getSupport());
      if (permission !== "granted") {
        toast(permission === "unsupported" ? "Les notifications ne sont pas disponibles dans ce navigateur." : "Permission refusée : active les notifications dans les réglages du navigateur.", { tone: "danger" });
        return;
      }
    }
    await updateSettings({ notificationsEnabled: enabled });
    await armInPageNotifications();
    if (enabled) setPeriodic(await registerPeriodicSync());
  };

  const exportBackup = async (kind: "json" | "zip") => {
    setBackupBusy(kind);
    try {
      const blob = kind === "json" ? await exportJsonBackup() : await exportZipBackup();
      downloadBlob(blob, backupFileName(kind === "zip"));
      toast("Sauvegarde exportée.", { tone: "success" });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Export impossible.", { tone: "danger" });
    } finally {
      setBackupBusy(null);
    }
  };

  const onPickBackup = async (file: File) => {
    setImportError(null);
    try {
      setParsed(await parseBackupFile(file));
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Fichier invalide.");
    }
  };

  const restore = async () => {
    if (!parsed) return;
    setRestoring(true);
    try {
      await restoreBackup(parsed);
      setParsed(null);
      toast("Sauvegarde restaurée.", { tone: "success" });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Restauration impossible.");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Paramètres" />

      <section>
        <SectionTitle>Profil local</SectionTitle>
        <Card className="space-y-3 p-4">
          <Field label="Nom" htmlFor="user-name" hint="Utilisé pour « Bonjour … » sur Aujourd'hui.">
            <div className="flex gap-2">
              <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} />
              <Button variant="primary" onClick={() => updateSettings({ userName: name.trim() || "Steeven" })} disabled={name.trim() === settings.userName}>
                Enregistrer
              </Button>
            </div>
          </Field>
          <Field label="Année scolaire (facultatif)" htmlFor="school-year">
            <div className="flex gap-2">
              <Input id="school-year" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026-2027" />
              <Button onClick={() => updateSettings({ schoolYear: year.trim() })} disabled={year.trim() === settings.schoolYear}>
                Enregistrer
              </Button>
            </div>
          </Field>
        </Card>
      </section>

      <section>
        <SectionTitle>Notifications</SectionTitle>
        <Card className="space-y-3 p-4">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Notification quotidienne « Programme du jour »</span>
            <input type="checkbox" className="h-5 w-5" checked={settings.notificationsEnabled} onChange={(e) => toggleNotifications(e.target.checked)} />
          </label>
          <Field label="Heure" htmlFor="notif-time">
            <Input id="notif-time" type="time" value={settings.notificationTime} onChange={(e) => e.target.value && updateSettings({ notificationTime: e.target.value })} className="max-w-40" />
          </Field>
          {support && (
            <div className="space-y-2 text-xs text-muted">
              <p>
                État : {support.permission === "granted" ? "permission accordée" : support.permission === "denied" ? "permission refusée dans le navigateur" : support.permission === "unsupported" ? "non pris en charge par ce navigateur" : "permission non demandée"}
                {periodic && ` · synchronisation en arrière-plan : ${periodic === "registered" ? "active" : periodic === "denied" ? "refusée" : "non disponible"}`}
              </p>
              <p className="font-medium text-fg">Ce qui est réellement garanti :</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>Application ouverte (onglet ou fenêtre installée) : notification à l'heure choisie, fiable.</li>
                <li>Application ouverte après l'heure sans notification reçue : rattrapage immédiat.</li>
                <li>Application fermée, Chrome/Edge Android installée sur l'écran d'accueil : le navigateur réveille l'application environ toutes les 12 h (Periodic Background Sync). La notification arrive alors après 17 h, mais pas forcément à 17 h pile.</li>
                <li>Application fermée sur iPhone/iPad, Safari ou Firefox : aucune API locale ne permet une notification programmée. Il faudrait un serveur d'envoi (Web Push) avec une tâche planifiée, non inclus dans cette version locale.</li>
              </ul>
              {support.ios && !support.standalone && <p>Sur iPhone, les notifications ne fonctionnent qu'une fois l'application ajoutée à l'écran d'accueil (Partager → Sur l'écran d'accueil).</p>}
            </div>
          )}
          <Button
            size="sm"
            onClick={async () => {
              const ok = await sendTestNotification();
              if (!ok) toast("Impossible d'afficher une notification (permission ?).", { tone: "danger" });
            }}
            icon={<Bell className="h-4 w-4" aria-hidden />}
            disabled={support?.permission !== "granted"}
          >
            Envoyer une notification de test
          </Button>
        </Card>
      </section>

      <section>
        <SectionTitle>Apparence</SectionTitle>
        <Card className="p-4">
          <Field label="Thème" htmlFor="theme">
            <Select id="theme" value={settings.theme} onChange={(e) => updateSettings({ theme: e.target.value as Theme })} className="max-w-60">
              <option value="light">Clair</option>
              <option value="dark">Sombre</option>
              <option value="system">Système</option>
            </Select>
          </Field>
        </Card>
      </section>

      <section>
        <SectionTitle>Installer Steeven Première</SectionTitle>
        <Card className="space-y-2 p-4 text-sm">
          {support?.standalone ? (
            <p className="text-success">L'application est installée et s'exécute en plein écran.</p>
          ) : installEvent ? (
            <Button
              variant="primary"
              onClick={async () => {
                await installEvent.prompt();
                const choice = await installEvent.userChoice;
                if (choice.outcome === "accepted") setInstallEvent(null);
              }}
              icon={<Smartphone className="h-4 w-4" aria-hidden />}
            >
              Installer sur cet appareil
            </Button>
          ) : (
            <>
              <p>Android / Chrome : menu ⋮ → « Installer l'application » ou « Ajouter à l'écran d'accueil ».</p>
              <p>iPhone / Safari : bouton Partager → « Sur l'écran d'accueil ».</p>
              <p>Ordinateur : icône d'installation dans la barre d'adresse (Chrome, Edge).</p>
            </>
          )}
          <p className="text-xs text-muted">L'application fonctionne aussi sans installation, y compris hors ligne après une première ouverture.</p>
        </Card>
      </section>

      <section>
        <SectionTitle>Données</SectionTitle>
        <Card className="space-y-4 p-4">
          <div>
            <p className="text-sm font-medium">Exporter ma sauvegarde</p>
            <p className="text-xs text-muted">Fichier portable pour changer de téléphone. « Complète » inclut les fichiers originaux (PDF, images…).</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button onClick={() => exportBackup("json")} loading={backupBusy === "json"} icon={<Download className="h-4 w-4" aria-hidden />}>
                Données uniquement (.json)
              </Button>
              <Button onClick={() => exportBackup("zip")} loading={backupBusy === "zip"} icon={<Download className="h-4 w-4" aria-hidden />}>
                Complète avec fichiers (.zip)
              </Button>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">Importer une sauvegarde</p>
            <p className="text-xs text-muted">Le fichier est vérifié, puis un résumé s'affiche avant tout remplacement.</p>
            <input ref={fileRef} type="file" accept=".json,.zip,application/json,application/zip" className="sr-only" onChange={(e) => e.target.files?.[0] && void onPickBackup(e.target.files[0])} />
            <Button className="mt-2" onClick={() => fileRef.current?.click()} icon={<Upload className="h-4 w-4" aria-hidden />}>
              Choisir un fichier de sauvegarde
            </Button>
            {importError && <div className="mt-2"><InlineError>{importError}</InlineError></div>}
            {lastRestore && <p className="mt-2 text-xs text-muted">Dernière restauration : {formatDateTime((lastRestore.value as { at: string }).at)}</p>}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <HardDrive className="h-4 w-4" aria-hidden />
            {usage ? `${usage.files} fichier(s) original(aux) stocké(s) · ${formatFileSize(usage.bytes)}` : "…"}
          </div>
          <div>
            <p className="text-sm font-medium text-danger">Réinitialiser les données</p>
            <p className="text-xs text-muted">Supprime tout (matières, chapitres, cours, tâches, historique) et recrée l'arborescence par défaut.</p>
            <Button variant="danger" className="mt-2" onClick={() => setResetOpen(true)}>
              Réinitialiser…
            </Button>
          </div>
        </Card>
      </section>

      <Modal
        open={parsed !== null}
        onClose={() => setParsed(null)}
        title="Restaurer cette sauvegarde ?"
        footer={
          <>
            <Button onClick={() => setParsed(null)}>Annuler</Button>
            <Button variant="danger" onClick={restore} loading={restoring}>
              Remplacer mes données actuelles
            </Button>
          </>
        }
      >
        {parsed && (
          <div className="space-y-3 text-sm">
            <p>
              Sauvegarde du {formatDateTime(parsed.summary.exportedAt)} (format v{parsed.summary.version}, {parsed.summary.includesFiles ? "avec fichiers" : "données uniquement"}).
            </p>
            <p>Cette sauvegarde contient :</p>
            <ul className="list-disc pl-5">
              <li>{parsed.summary.subjects} matières ({parsed.summary.folders} dossiers)</li>
              <li>{parsed.summary.chapters} chapitres</li>
              <li>{parsed.summary.courses} cours{parsed.summary.files ? ` (${parsed.summary.files} fichiers originaux)` : ""}</li>
              <li>{parsed.summary.exams} contrôles</li>
              <li>
                {parsed.summary.tasks} tâches, dont {parsed.summary.completedTasks} terminées et {parsed.summary.missedTasks} ratées
              </li>
              <li>{parsed.summary.flashcards} flashcards</li>
            </ul>
            <InlineInfo>Toutes les données actuelles de cet appareil seront remplacées. Exporte-les d'abord si tu veux les conserver.</InlineInfo>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          setResetText("");
        }}
        danger
        confirmLabel="Tout supprimer"
        title="Réinitialiser toutes les données ?"
        onConfirm={async () => {
          if (resetText.trim().toUpperCase() !== "SUPPRIMER") return;
          await resetAllData();
          await ensureInitialized();
          await updateSettings({ onboardingDone: true });
          setResetOpen(false);
          setResetText("");
          toast("Données réinitialisées.");
        }}
      >
        <p>Cette action est irréversible : matières, chapitres, cours, contrôles, tâches, historique, flashcards et réglages seront supprimés.</p>
        <p className="mt-2">Tape <span className="font-mono font-semibold">SUPPRIMER</span> pour confirmer :</p>
        <Input className="mt-2" value={resetText} onChange={(e) => setResetText(e.target.value)} aria-label="Confirmation" />
      </ConfirmDialog>
    </div>
  );
}
