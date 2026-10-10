import { useCallback, useEffect, useRef, useState } from 'react';
import { gatePassed, runGate } from '../gate';

type GateGateProps = {
  onPass: () => void;
};

/**
 * Экран «Проверка браузера»: показывается на входе в сайт, пока сервер не
 * выдаст куки. Скрывает всё остальное — до прохождения API всё равно ответит 403.
 */
function GateGate({ onPass }: GateGateProps) {
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const start = useCallback(async () => {
    setError(null);
    setProgress(0);

    try {
      await runGate(setProgress);
      onPass();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Проверка не пройдена.');
    }
  }, [onPass]);

  useEffect(() => {
    // React в dev запускает эффекты дважды — иначе задание ушло бы два раза.
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    if (gatePassed()) {
      onPass();
      return;
    }

    void start();
  }, [onPass, start]);

  return (
    <div className="gate-screen">
      <div className="gate-card">
        <p className="gate-brand">ASTRAL</p>
        <h1 className="gate-title">Проверка браузера</h1>
        <p className="gate-subtitle">
          Пару секунд — и ты внутри. Так мы отсекаем ботов и скрипты.
        </p>

        <div
          className="gate-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div className="gate-bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>

        {error ? (
          <>
            <p className="gate-error">{error}</p>
            <button type="button" className="gate-retry" onClick={() => void start()}>
              Попробовать снова
            </button>
          </>
        ) : (
          <p className="gate-status">{progress > 0.6 ? 'Почти готово…' : 'Проверяем…'}</p>
        )}
      </div>
    </div>
  );
}

export default GateGate;
