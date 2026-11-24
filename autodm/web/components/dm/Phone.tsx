import { Text } from "@seed-design/react";
import type { ReactNode } from "react";
import type { CarouselCard, DMButton, DMMessage } from "@shared/types";
import { isValidUrl } from "@shared/validation";

export function Phone(props: { username?: string; children: ReactNode; caption?: ReactNode }) {
  const name = props.username ?? "my_account";
  return (
    <div className="phone" aria-label="팬이 받을 DM 미리보기">
      <div className="phone__head">
        <div className="phone__avatar">{name.slice(0, 1).toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <Text textStyle="t4Bold">{name}</Text>
          <Text as="p" textStyle="t2Regular" color="fg.neutralSubtle">
            Instagram 메시지
          </Text>
        </div>
      </div>
      <div className="phone__body">
        {props.caption && <div className="dm-system">{props.caption}</div>}
        {props.children}
      </div>
    </div>
  );
}

export function Avatar({ name }: { name?: string }) {
  return <div className="phone__avatar">{(name ?? "M").slice(0, 1).toUpperCase()}</div>;
}
