import { useState } from 'react';
import { api } from '../api.ts';
import { ConfirmInline } from '../ui/ConfirmInline.tsx';
import { examplePublishResultSchema } from '../../shared/example-management.ts';
import { helpStrings } from './strings.ts';

/**
 * A RowLens admin publishes the training they are looking at as an example (ADR-0031), with the
 * in-page confirmation. The server rechecks the global grant, the active club and the training.
 */
export function PublishExample({
  sessionId,
  onPublished,
}: {
  sessionId: string;
  onPublished: () => void;
}) {
  const t = helpStrings();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const publish = () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    void api(`/api/example-management/${sessionId}/publish`, {
      method: 'POST',
      body: { confirm: true },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        examplePublishResultSchema.parse(await response.json());
        setConfirming(false);
        onPublished();
      })
      .catch(() => {
        setFailed(true);
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <section className="card publish-example" data-testid="publish-example" aria-busy={busy}>
      <h2>{t.publishAsExample}</h2>
      <p className="muted">{t.publishAsExampleHint}</p>
      {busy ? (
        <p role="status">{t.publishingExample}</p>
      ) : confirming ? (
        <ConfirmInline
          question={t.confirmPublication}
          yesLabel={t.publishExample}
          onConfirm={publish}
          onCancel={() => {
            setConfirming(false);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setConfirming(true);
          }}
        >
          {t.publishAsExample}
        </button>
      )}
      {failed && <p role="alert">{t.publishFailed}</p>}
    </section>
  );
}
