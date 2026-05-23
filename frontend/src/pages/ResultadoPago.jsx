import { CreditCard, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BrandMark, Button } from "../components/ui";
import { api, getUserToken } from "../lib/api";

// Pagina de retorno Mercado Pago: confirma el pago al volver del checkout.
export default function ResultadoPago() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState("Confirmando pago con Mercado Pago...");
  const [done, setDone] = useState(false);
  const token = getUserToken();

  useEffect(() => {
    // Sin sesion no se puede asociar el pago al colegiado.
    if (!token) {
      setMessage("Inicia sesion para confirmar el retorno del pago.");
      setDone(true);
      return;
    }

    const payload = {
      payment_id: params.get("payment_id"),
      collection_id: params.get("collection_id"),
      status: params.get("status"),
      external_reference: params.get("external_reference"),
    };

    // Confirmacion final contra el backend, que valida con Mercado Pago.
    api("/api/payments/mercadopago/return", {
      method: "POST",
      token,
      body: payload,
    })
      .then((data) => setMessage(data.message || "Pago confirmado."))
      .catch((error) => setMessage(error.message))
      .finally(() => setDone(true));
  }, []);

  return (
    <main className="verify-page">
      <section className="verify-card">
        <BrandMark />
        <div className="verification-icon">
          <CreditCard size={42} />
        </div>
        <h1>Resultado de pago</h1>
        <p>{message}</p>
        <div className="button-row center-row">
          <Button type="button" icon={WalletCards} onClick={() => navigate("/")}>
            Volver a mi portal
          </Button>
          {done && (
            <Link className="text-link" to="/">
              Ver estado
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
