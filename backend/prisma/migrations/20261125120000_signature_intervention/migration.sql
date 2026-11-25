-- CreateTable
CREATE TABLE "signature_intervention" (
    "id_intervention" INTEGER NOT NULL,
    "image" BYTEA NOT NULL,
    "nom_signataire" VARCHAR(100) NOT NULL,
    "signee_le" TIMESTAMPTZ(3) NOT NULL,
    "empreinte" CHAR(64) NOT NULL,
    "id_auteur" INTEGER NOT NULL,

    CONSTRAINT "signature_intervention_pkey" PRIMARY KEY ("id_intervention")
);

-- CreateIndex
CREATE INDEX "signature_intervention_id_auteur_idx" ON "signature_intervention"("id_auteur");

-- AddForeignKey
ALTER TABLE "signature_intervention" ADD CONSTRAINT "signature_intervention_id_intervention_fkey" FOREIGN KEY ("id_intervention") REFERENCES "intervention"("id_intervention") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_intervention" ADD CONSTRAINT "signature_intervention_id_auteur_fkey" FOREIGN KEY ("id_auteur") REFERENCES "utilisateur"("id_utilisateur") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- SQL écrit à la main : ce que schema.prisma ne sait pas exprimer
-- (docs/modele-donnees.md, section 5.1 ; ADR 0013).
-- =====================================================================

-- RG35 : 48 Ko au plus, comme la validation de l'API (filet de sécurité pour une écriture
-- qui passerait à côté de l'API).
ALTER TABLE "signature_intervention"
    ADD CONSTRAINT "signature_intervention_image_taille"
    CHECK (octet_length("image") <= 49152);

-- RG34 : SHA-256 en hexadécimal minuscule, tel que le calcule l'API.
ALTER TABLE "signature_intervention"
    ADD CONSTRAINT "signature_intervention_empreinte_format"
    CHECK ("empreinte" ~ '^[0-9a-f]{64}$');

-- RG31 : le nom du signataire est obligatoire et non vide.
ALTER TABLE "signature_intervention"
    ADD CONSTRAINT "signature_intervention_nom_signataire_non_vide"
    CHECK (btrim("nom_signataire") <> '');

-- RG32 : une signature est définitive. Toute mise à jour est refusée, même en SQL direct.
-- DELETE reste permis pour l'anonymisation RGPD (cahier des charges, 6.2). Conséquence assumée
-- (ADR 0013, Conséquences) : supprimer la ligne puis en insérer une autre avec une empreinte
-- recalculée n'est pas détecté ; l'empreinte ne protège pas contre un accès direct à la base.
CREATE FUNCTION "refuser_modification_signature"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'une signature est définitive (signature_intervention %)', OLD."id_intervention"
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "signature_intervention_definitive"
    BEFORE UPDATE ON "signature_intervention"
    FOR EACH ROW EXECUTE FUNCTION "refuser_modification_signature"();
