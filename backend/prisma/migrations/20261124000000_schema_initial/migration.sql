-- CreateEnum
CREATE TYPE "role_utilisateur" AS ENUM ('ADMIN', 'GESTIONNAIRE', 'TECHNICIEN');

-- CreateEnum
CREATE TYPE "type_client" AS ENUM ('PARTICULIER', 'PROFESSIONNEL');

-- CreateEnum
CREATE TYPE "urgence" AS ENUM ('NORMALE', 'PRIORITAIRE', 'URGENTE');

-- CreateEnum
CREATE TYPE "statut_intervention" AS ENUM ('A_PLANIFIER', 'PLANIFIEE', 'EN_COURS', 'TERMINEE', 'ANNULEE');

-- CreateTable
CREATE TABLE "utilisateur" (
    "id_utilisateur" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "mot_de_passe_hash" VARCHAR(255) NOT NULL,
    "nom" VARCHAR(100) NOT NULL,
    "prenom" VARCHAR(100) NOT NULL,
    "role" "role_utilisateur" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "mdp_a_changer" BOOLEAN NOT NULL DEFAULT true,
    "derniere_connexion" TIMESTAMPTZ(3),
    "cree_le" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maj_le" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("id_utilisateur")
);

-- CreateTable
CREATE TABLE "jeton_rafraichissement" (
    "id_jeton_rafraichissement" SERIAL NOT NULL,
    "hash_jeton" VARCHAR(255) NOT NULL,
    "expire_le" TIMESTAMPTZ(3) NOT NULL,
    "revoque_le" TIMESTAMPTZ(3),
    "cree_le" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_utilisateur" INTEGER NOT NULL,

    CONSTRAINT "jeton_rafraichissement_pkey" PRIMARY KEY ("id_jeton_rafraichissement")
);

-- CreateTable
CREATE TABLE "jeton_reinitialisation" (
    "id_jeton_reinitialisation" SERIAL NOT NULL,
    "hash_jeton" VARCHAR(255) NOT NULL,
    "expire_le" TIMESTAMPTZ(3) NOT NULL,
    "utilise_le" TIMESTAMPTZ(3),
    "cree_le" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_utilisateur" INTEGER NOT NULL,

    CONSTRAINT "jeton_reinitialisation_pkey" PRIMARY KEY ("id_jeton_reinitialisation")
);

-- CreateTable
CREATE TABLE "client" (
    "id_client" SERIAL NOT NULL,
    "type_client" "type_client" NOT NULL,
    "nom_client" VARCHAR(100),
    "prenom_client" VARCHAR(100),
    "raison_sociale" VARCHAR(150),
    "telephone" VARCHAR(20) NOT NULL,
    "email_client" VARCHAR(255),
    "archive" BOOLEAN NOT NULL DEFAULT false,
    "archive_le" TIMESTAMPTZ(3),
    "cree_le" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maj_le" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id_client")
);

-- CreateTable
CREATE TABLE "adresse" (
    "id_adresse" SERIAL NOT NULL,
    "rue" VARCHAR(255) NOT NULL,
    "complement" VARCHAR(255),
    "code_postal" CHAR(5) NOT NULL,
    "ville" VARCHAR(100) NOT NULL,
    "infos_acces" VARCHAR(500),
    "archive" BOOLEAN NOT NULL DEFAULT false,
    "archive_le" TIMESTAMPTZ(3),
    "id_client" INTEGER NOT NULL,

    CONSTRAINT "adresse_pkey" PRIMARY KEY ("id_adresse")
);

-- CreateTable
CREATE TABLE "technicien" (
    "id_technicien" SERIAL NOT NULL,
    "telephone" VARCHAR(20) NOT NULL,
    "couleur_planning" VARCHAR(7) NOT NULL,
    "archive" BOOLEAN NOT NULL DEFAULT false,
    "archive_le" TIMESTAMPTZ(3),
    "id_utilisateur" INTEGER NOT NULL,

    CONSTRAINT "technicien_pkey" PRIMARY KEY ("id_technicien")
);

-- CreateTable
CREATE TABLE "indisponibilite" (
    "id_indisponibilite" SERIAL NOT NULL,
    "debut" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "motif" VARCHAR(255),
    "id_technicien" INTEGER NOT NULL,

    CONSTRAINT "indisponibilite_pkey" PRIMARY KEY ("id_indisponibilite")
);

-- CreateTable
CREATE TABLE "tournee" (
    "id_tournee" SERIAL NOT NULL,
    "date_tournee" DATE NOT NULL,
    "cree_le" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_technicien" INTEGER NOT NULL,
    "id_createur" INTEGER NOT NULL,

    CONSTRAINT "tournee_pkey" PRIMARY KEY ("id_tournee")
);

-- CreateTable
CREATE TABLE "type_intervention" (
    "id_type_intervention" SERIAL NOT NULL,
    "libelle" VARCHAR(100) NOT NULL,
    "duree_defaut_min" INTEGER NOT NULL,

    CONSTRAINT "type_intervention_pkey" PRIMARY KEY ("id_type_intervention")
);

-- CreateTable
CREATE TABLE "intervention" (
    "id_intervention" SERIAL NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "urgence" "urgence" NOT NULL,
    "statut" "statut_intervention" NOT NULL DEFAULT 'A_PLANIFIER',
    "duree_estimee_min" INTEGER NOT NULL,
    "debut_prevu" TIMESTAMPTZ(3),
    -- Modifié à la main : colonne générée, voir la fin du fichier.
    "fin_prevue" TIMESTAMPTZ(3) GENERATED ALWAYS AS (("debut_prevu" AT TIME ZONE 'UTC' + make_interval(mins => "duree_estimee_min")) AT TIME ZONE 'UTC') STORED,
    "ordre_tournee" INTEGER,
    "compte_rendu" VARCHAR(2000),
    "motif_annulation" VARCHAR(500),
    "demarree_le" TIMESTAMPTZ(3),
    "terminee_le" TIMESTAMPTZ(3),
    "annulee_le" TIMESTAMPTZ(3),
    "cree_le" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maj_le" TIMESTAMPTZ(3) NOT NULL,
    "id_adresse" INTEGER NOT NULL,
    "id_type_intervention" INTEGER NOT NULL,
    "id_createur" INTEGER NOT NULL,
    "id_tournee" INTEGER,

    CONSTRAINT "intervention_pkey" PRIMARY KEY ("id_intervention")
);

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_email_key" ON "utilisateur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "jeton_rafraichissement_hash_jeton_key" ON "jeton_rafraichissement"("hash_jeton");

-- CreateIndex
CREATE INDEX "jeton_rafraichissement_id_utilisateur_idx" ON "jeton_rafraichissement"("id_utilisateur");

-- CreateIndex
CREATE UNIQUE INDEX "jeton_reinitialisation_hash_jeton_key" ON "jeton_reinitialisation"("hash_jeton");

-- CreateIndex
CREATE INDEX "jeton_reinitialisation_id_utilisateur_idx" ON "jeton_reinitialisation"("id_utilisateur");

-- CreateIndex
CREATE INDEX "client_nom_client_idx" ON "client"("nom_client");

-- CreateIndex
CREATE INDEX "client_raison_sociale_idx" ON "client"("raison_sociale");

-- CreateIndex
CREATE INDEX "client_telephone_idx" ON "client"("telephone");

-- CreateIndex
CREATE INDEX "adresse_id_client_idx" ON "adresse"("id_client");

-- CreateIndex
CREATE INDEX "adresse_ville_idx" ON "adresse"("ville");

-- CreateIndex
CREATE UNIQUE INDEX "technicien_id_utilisateur_key" ON "technicien"("id_utilisateur");

-- CreateIndex
CREATE INDEX "indisponibilite_id_technicien_debut_fin_idx" ON "indisponibilite"("id_technicien", "debut", "fin");

-- CreateIndex
CREATE INDEX "tournee_date_tournee_idx" ON "tournee"("date_tournee");

-- CreateIndex
CREATE INDEX "tournee_id_createur_idx" ON "tournee"("id_createur");

-- CreateIndex
CREATE UNIQUE INDEX "tournee_id_technicien_date_tournee_key" ON "tournee"("id_technicien", "date_tournee");

-- CreateIndex
CREATE UNIQUE INDEX "type_intervention_libelle_key" ON "type_intervention"("libelle");

-- CreateIndex
CREATE INDEX "intervention_statut_urgence_idx" ON "intervention"("statut", "urgence");

-- CreateIndex
CREATE INDEX "intervention_id_adresse_idx" ON "intervention"("id_adresse");

-- CreateIndex
CREATE INDEX "intervention_id_type_intervention_idx" ON "intervention"("id_type_intervention");

-- CreateIndex
CREATE INDEX "intervention_id_createur_idx" ON "intervention"("id_createur");

-- AddForeignKey
ALTER TABLE "jeton_rafraichissement" ADD CONSTRAINT "jeton_rafraichissement_id_utilisateur_fkey" FOREIGN KEY ("id_utilisateur") REFERENCES "utilisateur"("id_utilisateur") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jeton_reinitialisation" ADD CONSTRAINT "jeton_reinitialisation_id_utilisateur_fkey" FOREIGN KEY ("id_utilisateur") REFERENCES "utilisateur"("id_utilisateur") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adresse" ADD CONSTRAINT "adresse_id_client_fkey" FOREIGN KEY ("id_client") REFERENCES "client"("id_client") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technicien" ADD CONSTRAINT "technicien_id_utilisateur_fkey" FOREIGN KEY ("id_utilisateur") REFERENCES "utilisateur"("id_utilisateur") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indisponibilite" ADD CONSTRAINT "indisponibilite_id_technicien_fkey" FOREIGN KEY ("id_technicien") REFERENCES "technicien"("id_technicien") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournee" ADD CONSTRAINT "tournee_id_technicien_fkey" FOREIGN KEY ("id_technicien") REFERENCES "technicien"("id_technicien") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournee" ADD CONSTRAINT "tournee_id_createur_fkey" FOREIGN KEY ("id_createur") REFERENCES "utilisateur"("id_utilisateur") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_id_adresse_fkey" FOREIGN KEY ("id_adresse") REFERENCES "adresse"("id_adresse") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_id_type_intervention_fkey" FOREIGN KEY ("id_type_intervention") REFERENCES "type_intervention"("id_type_intervention") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_id_createur_fkey" FOREIGN KEY ("id_createur") REFERENCES "utilisateur"("id_utilisateur") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_id_tournee_fkey" FOREIGN KEY ("id_tournee") REFERENCES "tournee"("id_tournee") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- SQL écrit à la main : ce que schema.prisma ne sait pas exprimer
-- (docs/modele-donnees.md, section 5.1). Prisma ne relit pas ces
-- contraintes : elles sont vérifiées par PostgreSQL à chaque écriture,
-- y compris pour les requêtes SQL manuelles de la card #21.
-- =====================================================================

-- intervention.fin_prevue (ci-dessus) : une colonne générée exige une expression IMMUTABLE.
-- timestamptz + interval n'en est pas une (elle dépend du fuseau de la session), d'où le
-- passage par l'heure UTC : ajouter des minutes ne dépend d'aucun changement d'heure.

-- RG13 / RG14 : ordre unique dans une tournée, vérifié en fin de transaction pour
-- permettre le réordonnancement (deux interventions échangent leur rang sans conflit).
ALTER TABLE "intervention"
    ADD CONSTRAINT "intervention_tournee_ordre_key"
    UNIQUE ("id_tournee", "ordre_tournee") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "intervention"
    ADD CONSTRAINT "intervention_duree_estimee_positive"
    CHECK ("duree_estimee_min" > 0);

ALTER TABLE "intervention"
    ADD CONSTRAINT "intervention_ordre_tournee_positif"
    CHECK ("ordre_tournee" >= 1);

-- Hypothèse (non écrite dans le MLD) : une intervention a un rang si et seulement si elle est dans une tournée.
ALTER TABLE "intervention"
    ADD CONSTRAINT "intervention_ordre_si_tournee"
    CHECK (("id_tournee" IS NULL) = ("ordre_tournee" IS NULL));

-- RG02 : une intervention planifiée, en cours ou terminée est dans une tournée, sur un créneau.
ALTER TABLE "intervention"
    ADD CONSTRAINT "intervention_planifiee_dans_tournee"
    CHECK (
        "statut" NOT IN ('PLANIFIEE', 'EN_COURS', 'TERMINEE')
        OR ("id_tournee" IS NOT NULL AND "debut_prevu" IS NOT NULL)
    );

-- RG05 : le motif d'annulation est obligatoire et non vide.
ALTER TABLE "intervention"
    ADD CONSTRAINT "intervention_motif_si_annulee"
    CHECK ("statut" <> 'ANNULEE' OR btrim(coalesce("motif_annulation", '')) <> '');

ALTER TABLE "type_intervention"
    ADD CONSTRAINT "type_intervention_duree_defaut_positive"
    CHECK ("duree_defaut_min" > 0);

ALTER TABLE "indisponibilite"
    ADD CONSTRAINT "indisponibilite_periode_valide"
    CHECK ("fin" > "debut");

-- Identité du client : nom pour un particulier, raison sociale pour un professionnel.
ALTER TABLE "client"
    ADD CONSTRAINT "client_identite"
    CHECK (
        ("type_client" = 'PARTICULIER' AND btrim(coalesce("nom_client", '')) <> '')
        OR ("type_client" = 'PROFESSIONNEL' AND btrim(coalesce("raison_sociale", '')) <> '')
    );

ALTER TABLE "adresse"
    ADD CONSTRAINT "adresse_code_postal_format"
    CHECK ("code_postal" ~ '^[0-9]{5}$');

ALTER TABLE "technicien"
    ADD CONSTRAINT "technicien_couleur_planning_format"
    CHECK ("couleur_planning" ~ '^#[0-9A-Fa-f]{6}$');
