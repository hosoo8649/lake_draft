import {
  IconPencilLine,
  IconTrashcanLine,
  IconPlusLine,
} from "@karrotmarket/react-monochrome-icon";
import { HStack, Text, VStack, PrefixIcon } from "@seed-design/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ActionButton } from "seed-design/ui/action-button";
import type { LinkItem } from "@shared/types";
import { LIMITS } from "@shared/limits";
import { isValidUrl, normalizeUrl } from "@shared/validation";
import { useConfirm, useErrorToast, useToast } from "../components/feedback";
import { TextInput } from "../components/fields";
import { Modal } from "../components/Modal";
import { EmptyState, IconBtn, PageHeader, Section } from "../components/ui";
import { api, useApi } from "../lib/api";

export function LinksPage() {
  const nav = useNavigate();
  const { data, reload } = useApi<LinkItem[]>("/links");
  const [edit, setEdit] = useState<Partial<LinkItem> | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const onError = useErrorToast();
  const confirm = useConfirm();

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      if (edit.id)
        await api(`/links/${edit.id}`, { method: "PUT", body: edit });
      else await api("/links", { body: edit });
      setEdit(null);
      toast("링크를 저장했어요", "positive");
      void reload();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (l: LinkItem) => {
    if (
      !(await confirm({
        title: `‘${l.title}’ 링크를 지울까요?`,
        description: "이미 만든 자동화의 버튼 링크는 그대로 남아요.",
        confirmLabel: "삭제",
        danger: true,
      }))
    )
      return;
    await api(`/links/${l.id}`, { method: "DELETE" });
    void reload();
  };

  const urlValid = isValidUrl(normalizeUrl(edit?.url ?? ""));

  return (
    <div className="page page--narrow">
      <PageHeader
        title="내 링크"
        description="자주 쓰는 링크를 저장해 두면 DM 버튼에 바로 고를 수 있고, 링크에서 바로 자동 DM을 만들 수 있어요"
        actions={
          <ActionButton
            variant="brandSolid"
            onClick={() => setEdit({ title: "", url: "" })}
          >
            <PrefixIcon svg={<IconPlusLine />} />
            링크 추가
          </ActionButton>
        }
      />
      <Section>
        {!data || data.length === 0 ? (
          <EmptyState
            emoji="🔗"
            title="저장한 링크가 없어요"
            description="쇼핑몰·공구·신청서처럼 자주 보내는 링크를 저장해 보세요."
          />
        ) : (
          <VStack gap="x2">
            {data.map((l) => (
              <HStack
                key={l.id}
                gap="x3"
                className="card"
                align="center"
                wrap
                style={{ padding: "12px 16px" }}
              >
                <VStack gap="x0_5" grow style={{ minWidth: 0, flexBasis: 220 }}>
                  <Text textStyle="t5Bold">{l.title}</Text>
                  <Text
                    textStyle="t3Regular"
                    color="fg.neutralSubtle"
                    maxLines={1}
                  >
                    {l.url}
                  </Text>
                </VStack>
                <ActionButton
                  size="small"
                  variant="neutralWeak"
                  onClick={() => nav(`/automations/new?link=${l.id}`)}
                >
                  📸 자동 DM 만들기
                </ActionButton>
                <IconBtn
                  label="수정"
                  icon={<IconPencilLine />}
                  onClick={() => setEdit(l)}
                />
                <IconBtn
                  label="삭제"
                  icon={<IconTrashcanLine />}
                  onClick={() => remove(l)}
                />
              </HStack>
            ))}
          </VStack>
        )}
      </Section>
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "링크 수정" : "링크 추가"}
        primary={{
          label: "저장",
          onClick: save,
          loading: busy,
          disabled: !edit?.title?.trim() || !urlValid,
        }}
      >
        <VStack gap="x4">
          <TextInput
            label="링크 이름"
            value={edit?.title ?? ""}
            onChange={(title) => setEdit({ ...edit, title })}
            max={LIMITS.linkTitle}
            autoFocus
          />
          <TextInput
            label="링크 주소"
            placeholder="https://"
            value={edit?.url ?? ""}
            onChange={(url) => setEdit({ ...edit, url })}
            error={
              edit?.url && !urlValid
                ? "올바른 링크 주소를 넣어 주세요"
                : undefined
            }
          />
        </VStack>
      </Modal>
    </div>
  );
}
