import { BadgeCheck } from "lucide-react";
import { VirtualCard, memberCardCode } from "../../../components/VirtualCard";
import { StatusBadge } from "../../../components/ui";

// Modulo Carnet: visualiza solo el carnet virtual.
export function UserCardPanel({
  activeModule,
  member,
  user,
  application,
  cardRef,
}) {
  return (
    <aside className={`panel side-panel ${activeModule === "carnet" ? "" : "module-hidden"}`} id="carnet">
      <div className="section-title">
        <div>
          <span>Carnet virtual</span>
          <h2>{member ? memberCardCode(member) : "Pendiente de aprobacion"}</h2>
        </div>
        {member && <StatusBadge status={member.status} />}
      </div>

      {member ? (
        <VirtualCard cardRef={cardRef} user={user} application={application} member={member} />
      ) : (
        <div className="empty-state">
          <BadgeCheck size={34} />
          <p>El carnet se generara cuando el administrador apruebe la solicitud.</p>
        </div>
      )}
    </aside>
  );
}
