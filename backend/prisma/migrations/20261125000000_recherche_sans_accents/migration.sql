-- Recherche de clients et de techniciens insensible aux accents (contrat d'API, section 4) :
-- « helene » doit trouver « Hélène ». L'extension est livrée avec PostgreSQL (contrib).
CREATE EXTENSION IF NOT EXISTS unaccent;
