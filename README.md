# Steeven Première

Application personnelle de travail scolaire (Première) pour Steeven : les cours et les contrôles sont saisis, l'application génère automatiquement le planning de révisions (méthode des J) et dit chaque jour quoi faire.

```
Cours → Chapitre → J0 → J1 / J3 / J7 / J14 → Contrôle → J-3 / J-2 / J-1 / Jour du contrôle
→ Todo quotidienne → Travail réalisé ou raté → Statistiques
```

- Local-first : toutes les données sont dans IndexedDB (Dexie). Pas de compte, pas de login.
- PWA installable (Android, iOS, ordinateur), fonctionne hors ligne après une première ouverture.
- Sauvegarde/restauration portable (JSON ou ZIP avec fichiers) pour changer de téléphone.
- Flashcards IA (clé serveur optionnelle) et export Anki (TSV UTF-8).

## Lancer

```bash
npm install
npm run dev        # http://localhost:3000
```

Production :

```bash
npm run build
npm run start      # http://localhost:3000
```

Le Service Worker (hors ligne, notifications en arrière-plan) n'est enregistré qu'en production (`npm run build && npm run start`).

## Tester

```bash
npm test           # Vitest : moteur des J, dates, ratés, résultat +1 h, sauvegarde, Anki
npm run typecheck  # TypeScript strict
npm run lint       # ESLint
```

Les tests couvrent notamment : J0 = 1er cours (pas de redémarrage au 2e cours), J1/J3/J7/J14, J-3/J-2/J-1/jour J, deux contrôles indépendants, changement de date de contrôle, tâches devenues inutiles, tâches ratées idempotentes, +1 h une seule fois, restauration complète, encodage Anki (accents, Δ, tabulations…).

## Déployer

L'application est un projet Next.js standard : Vercel, Netlify, ou n'importe quel hébergeur Node (`npm run build` puis `npm run start`). Elle doit être servie en HTTPS pour l'installation PWA et les notifications.

Variables d'environnement (voir `.env.example`) — toutes facultatives :

| Variable | Rôle |
| --- | --- |
| `ANTHROPIC_API_KEY` | Active « Générer les flashcards » (appels IA côté serveur uniquement). |
| `AI_MODEL` | Modèle utilisé (défaut `claude-opus-5`). |
| `YOUTUBE_API_KEY` | Active la recherche automatique de vidéos (YouTube Data API v3). |

Sans clé, l'application reste entièrement fonctionnelle : planning, tâches, contrôles, résultats, statistiques, sauvegarde, cartes manuelles et export Anki. Les boutons concernés affichent « Génération IA non configurée » / « Recherche automatique non configurée ».

## Structure

```
src/
  app/                  Next.js : layout, page catch-all (SPA), manifest, routes API serveur
  components/           coquille (AppShell, Nav, Onboarding), primitives UI, cartes métier
  domain/
    types.ts            modèle de données (Folder, Subject, Chapter, Course, Exam, Task…)
    labels.ts           libellés français
    revision/           stratégies déclaratives : mathematics, physics, svt, osef, french, none
    scheduling/         moteur des J (fonctions pures + tests)
  db/                   schéma Dexie/IndexedDB, arborescence par défaut, réglages
  services/             opérations base (planning, cours, arborescence, flashcards, ressources,
                        sauvegarde, statistiques, notifications, extraction de fichiers, IA)
  features/             pages : dashboard, subjects, chapters, courses, exams, tasks,
                        flashcards, statistics, settings, principles, calendar, resources
  hooks/ lib/           hooks React, dates locales, routeur client, téléchargement
public/sw.js            Service Worker (cache hors ligne + notification en arrière-plan)
```

### Règles métier (src/domain/scheduling/engine.ts)

- J0 = jour d'ajout du **premier** cours ; les cours suivants ne changent rien ; renommer ou supprimer un cours ne change pas J0.
- Les tâches ne sont créées que pour des dates ≥ aujourd'hui.
- Une tâche terminée ou ratée n'est jamais modifiée par le moteur.
- Changement de date d'un contrôle : les tâches à venir sont remplacées, l'historique est conservé.
- Une tâche J postérieure au dernier contrôle connu du chapitre passe en « Annulée » (réversible si un contrôle ultérieur est ajouté).
- À chaque ouverture : les tâches normales d'hier ou avant, non terminées, deviennent « Ratées » (une seule fois). Le travail supplémentaire n'expire jamais.
- Résultat de contrôle : un seul enregistrement par contrôle (`id = examId`), donc « Non » ne génère jamais plus d'1 h.

### Modifier les méthodes

Chaque matière a un `strategyType`. Les tâches sont déclarées dans `src/domain/revision/strategies/*.ts` (titre, description, durée, décalage en jours, requêtes de ressources). Changer « J7 Mathématiques : annales » en « 1 h 30 d'annales » revient à modifier un objet.

## Stockage et sauvegarde

- Données : IndexedDB, base `steeven-premiere`, versionnée (ajouter `this.version(n)` dans `src/db/db.ts` pour une migration).
- Fichiers importés (PDF, images…) : stockés en blobs dans la table `files`. L'espace utilisé est affiché dans Paramètres ; on peut supprimer le fichier original en gardant le texte extrait.
- Sauvegarde « Données uniquement » : `steeven-premiere-backup-AAAA-MM-JJ.json` (`{ app, version, exportedAt, data }`).
- Sauvegarde « Complète avec fichiers » : ZIP contenant `data.json` + `files/<id>`.
- Import : validation du format, de la version et des champs critiques, puis résumé (matières, chapitres, cours, contrôles, tâches terminées/ratées) avant remplacement.

## Import de cours

- PDF : texte extrait localement (pdf.js) si le PDF contient du texte. Un scan sans texte est conservé, le texte peut être ajouté à la main.
- Word (.docx) : mammoth. PowerPoint (.pptx) : lecture des diapositives.
- Images/photos : aucun OCR local, l'image est conservée et le texte peut être collé.
- Doublon (même nom + même taille dans le chapitre) : avertissement « Ce cours semble déjà être présent ».

## Notifications : ce qui est réellement possible

Objectif : une notification « Programme du jour » à 17:00 (heure locale, configurable).

| Situation | Comportement |
| --- | --- |
| Application ouverte (onglet ou fenêtre installée) | Notification à l'heure choisie, fiable. |
| Application ouverte après l'heure, rien reçu | Rattrapage immédiat, une fois par jour. |
| Application fermée, Chrome/Edge Android installée | Periodic Background Sync : le navigateur réveille le Service Worker environ toutes les 12 h (fréquence décidée par le navigateur). La notification arrive après 17 h, pas forcément à 17 h pile. |
| Application fermée sur iPhone/iPad, Safari, Firefox | Aucune API locale ne permet une notification programmée. Seul un serveur Web Push avec une tâche planifiée pourrait le faire ; non inclus (nécessite un backend). |

Sur iPhone, les notifications ne fonctionnent qu'une fois l'application ajoutée à l'écran d'accueil (iOS 16.4+).

## IA et ressources

- L'IA est appelée uniquement par une action explicite (« Générer les flashcards ») après un message indiquant que le contenu sélectionné sera envoyé au fournisseur configuré. Les cours longs sont découpés en lots, fusionnés, dédoublonnés.
- Aucune clé n'est jamais envoyée au navigateur : les routes `/api/ai/*` et `/api/resources/*` tournent côté serveur.
- Sans clé YouTube, l'application propose des liens de recherche (YouTube/Google) construits à partir de la matière, du chapitre et du J, plus l'ajout manuel de ressources. Aucun lien n'est inventé.

## Limites connues

- Notifications à heure fixe hors application ouverte : voir tableau ci-dessus.
- OCR d'images : non disponible localement.
- Synchronisation cloud : non incluse (export/import manuel). Les identifiants sont des UUID stables avec horodatages, ce qui permettra une synchronisation ultérieure.
- Une seule année scolaire par base ; pour archiver, exporter une sauvegarde puis réinitialiser.
