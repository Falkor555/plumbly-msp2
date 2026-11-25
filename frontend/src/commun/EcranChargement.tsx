/** Affiché pendant la vérification de la session : évite le clignotement de la page de connexion. */
export function EcranChargement() {
  return (
    <div role="status" className="flex min-h-dvh items-center justify-center bg-fond">
      <p className="text-gris-texte">Chargement…</p>
    </div>
  );
}
