import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { nextRepertoire, ratingCopy } from './ratingCopy';
import { createRatingEffects } from './ratingEffects';

interface Props {
  dishName: string;
  value: number | null;
  onChange: (value: number) => void;
  invalid: boolean;
  disabled: boolean;
  dedicated?: boolean;
}

export function RatingSlider({ dishName, value, onChange, invalid, disabled, dedicated = false }: Props) {
  const [repertoire, setRepertoire] = useState(() => nextRepertoire());
  const card = useRef<HTMLDivElement>(null);
  const effects = useRef<ReturnType<typeof createRatingEffects> | null>(null);
  const interacted = useRef(false);
  const keyboardAt = useRef<number | null>(null);
  const copy = ratingCopy(value, repertoire);
  const fraction = ((value ?? 50) - 1) / 99;

  useEffect(() => {
    const controller = createRatingEffects(card.current!);
    effects.current = controller;
    return () => { controller.dispose(); effects.current = null; };
  }, []);
  useEffect(() => {
    effects.current?.update(value, copy.band, interacted.current && !disabled);
    interacted.current = false;
  }, [value, repertoire, copy.band, disabled]);

  function startGesture() {
    if (disabled) return;
    interacted.current = true;
    setRepertoire(previous => nextRepertoire(previous));
  }
  function choose(next: number) {
    if (disabled) return;
    interacted.current = true;
    onChange(next);
  }

  return <section className="rating-slider" aria-label="Tu puntuación del plato">
    <div className="bacon-rating" ref={card} data-chosen={value !== null} data-perfect={value === 100}
      style={{ '--b-pos': `calc(20px + (100% - 40px) * ${fraction})`, '--b-glow': value === null ? '.04' : String(.07 + fraction * .3), '--b-hue': String(34 - fraction * 18) } as CSSProperties}>
      <canvas className="bacon-cooking" aria-hidden="true"/>
      {!dedicated && <div className="bacon-dish">{dishName}</div>}
      <label className="bacon-title" htmlFor="rating">{dedicated ? '¿Qué tal estaba?' : '1. ¿Qué tal estaba?'}</label>
      <div className="bacon-stage">
        <div className="bacon-score">
          <div className="bacon-aura" aria-hidden="true"/>
          <div className="bacon-plate" aria-hidden="true"/>
          <output htmlFor="rating" aria-live="off">{value ?? '—'}</output>
        </div>
        <div className="bacon-reaction"><span className="bacon-phrase">{copy.phrase}</span></div>
        <div className="bacon-caption">{copy.caption}</div>
      </div>
      <div className="bacon-slider-area">
        <div className="bacon-slider-wrap">
          <div className="bacon-track" aria-hidden="true"><div className="bacon-fill"/><canvas className="bacon-liquid"/><div className="bacon-grain"/></div>
          <input id="rating" type="range" min="1" max="100" step="1" value={value ?? 50} disabled={disabled}
            aria-valuetext={value === null ? 'Sin elegir. Selecciona una puntuación del 1 al 100.' : `${value} de 100. ${copy.phrase}`}
            aria-invalid={invalid} aria-describedby={invalid ? 'rating-help rating-error' : 'rating-help'}
            onPointerDown={startGesture} onChange={event => choose(+event.target.value)}
            onPointerUp={event => choose(+event.currentTarget.value)}
            onKeyDown={event => {
              if (disabled) return;
              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', ' ', 'Enter'].includes(event.key)) {
                const now = performance.now();
                if (keyboardAt.current === null || now - keyboardAt.current > 700) startGesture();
                keyboardAt.current = now;
              }
              if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); choose(+event.currentTarget.value); }
            }}/>
        </div>
        <div className="bacon-endpoints"><span>1 · No repetiría</span><span>100 · Otra ración</span></div>
      </div>
      <div className="bacon-footer"><span className="bacon-status-dot" aria-hidden="true"/><span id="rating-help">{value === null ? 'Toca o arrastra para elegir tu nota' : `${value} de 100 · Tu nota está elegida`}</span></div>
      {invalid && <p id="rating-error" className="field-error" role="alert">Elige una puntuación entre 1 y 100.</p>}
    </div>
  </section>;
}
