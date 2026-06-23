-- ─────────────────────────────────────────────────────────────────────────
-- 067 : Durée de conservation par article + calcul auto expiry_date des lots
-- ─────────────────────────────────────────────────────────────────────────
-- Contexte : le champ lots.expiry_date existait déjà (lu/affiché partout)
-- mais aucun écran ne le renseignait → toujours "N/A". Le champ shelf_life
-- (texte libre, ex. "18 mois") des fiches techniques produit n'est lui que
-- documentaire et n'est connecté à aucun calcul.
--
-- Solution : ajout d'une durée de conservation structurée (en jours) par
-- article, utilisée pour calculer automatiquement :
--     lots.expiry_date = lots.reception_date + articles.shelf_life_days
--
-- Le calcul est fait côté frontend (Réception MP, Réception PF, clôture OF)
-- ET sécurisé côté base via un trigger BEFORE INSERT (filet de sécurité pour
-- les imports/scripts qui inséreraient un lot sans passer par l'app).

-- 1. Nouvelle colonne sur articles
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS shelf_life_days integer;

COMMENT ON COLUMN articles.shelf_life_days IS
  'Durée de conservation en jours. Utilisée pour calculer automatiquement lots.expiry_date = lots.reception_date + shelf_life_days. NULL = pas de calcul automatique pour cet article (le champ texte libre "shelf_life" des fiches techniques produit reste indépendant et purement documentaire).';

ALTER TABLE articles
  ADD CONSTRAINT chk_shelf_life_days_positive
  CHECK (shelf_life_days IS NULL OR shelf_life_days > 0);

-- 2. Trigger de calcul automatique (filet de sécurité DB)
--    Ne s'applique qu'à l'INSERT et seulement si expiry_date n'est pas déjà
--    fourni explicitement (le frontend peut donc aussi pré-calculer et
--    envoyer la valeur directement sans conflit).
CREATE OR REPLACE FUNCTION fn_set_lot_expiry_date()
RETURNS TRIGGER AS $$
DECLARE
  v_shelf_life_days integer;
BEGIN
  IF NEW.expiry_date IS NULL AND NEW.article_id IS NOT NULL THEN
    SELECT shelf_life_days INTO v_shelf_life_days
    FROM articles
    WHERE id = NEW.article_id;

    IF v_shelf_life_days IS NOT NULL THEN
      NEW.expiry_date := COALESCE(NEW.reception_date, CURRENT_DATE) + v_shelf_life_days;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_lot_expiry_date ON lots;
CREATE TRIGGER trg_set_lot_expiry_date
  BEFORE INSERT ON lots
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_lot_expiry_date();

-- 3. Recharger le cache de schéma PostgREST (Supabase)
NOTIFY pgrst, 'reload schema';
