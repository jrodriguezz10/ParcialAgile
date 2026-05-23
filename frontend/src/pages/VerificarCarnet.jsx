import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { VirtualCard } from "../components/VirtualCard";
import { BrandMark } from "../components/ui";
import { api } from "../lib/api";

// Pagina publica: verifica el QR/codigo del carnet sin iniciar sesion.
export default function VerificarCarnet() {
  const { code } = useParams();
  const [record, setRecord] = useState(null);
  const [message, setMessage] = useState("Consultando carnet...");
  const cardRef = useRef(null);

  useEffect(() => {
    // Consulta publica del estado actual del colegiado.
    api(`/api/public/verify/${code}`)
      .then((data) => {
        setRecord(data);
        setMessage("");
      })
      .catch((error) => setMessage(error.message));
  }, [code]);

  return (
    <main className="verify-page">
      <section className="verify-card">
        <BrandMark />
        {record ? (
          <>
            <h1>Carnet virtual</h1>
            <VirtualCard
              cardRef={cardRef}
              user={record}
              application={{ photo_url: record.photo_url }}
              member={record}
            />
          </>
        ) : (
          <div className="empty-state">{message}</div>
        )}
        <Link className="text-link" to="/">
          Volver al portal
        </Link>
      </section>
    </main>
  );
}
