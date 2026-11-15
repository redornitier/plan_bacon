/** One complete repertoire per gesture, so moving back and forth stays coherent. */
export const ratingRepertoires = [
  ['Ni con hambre.', 'Hoy no, chef.', 'Sin fuegos artificiales.', '¡Sabroso!', '¡Brutal!', 'Que no se acabe.', 'Otra ración. Ya.'],
  ['Ni el pan lo salva.', 'Mejor paso el plato.', 'Se deja comer.', 'Esto pide pan.', 'Aquí se moja todo.', 'El plato vuelve limpio.', 'Traed otra barra.'],
  ['Houston, la cena.', 'El chef tenía prisa.', 'Aprobado sin aplausos.', 'Mis respetos al chef.', 'Esto merece ovación.', 'Que salga el chef.', '¡En pie por el chef!'],
  ['No hubo química.', 'Mejor como amigos.', 'Podemos repetir cita.', 'Hay algo entre nosotros.', 'Me tiene ganado.', 'Amor al primer bocado.', 'Hasta el último bocado.'],
  ['¿Quién pidió esto?', 'Tú quédate mi parte.', 'Bueno, ni tan mal.', 'Oye, pues está rico.', '¡Tenéis que probarlo!', 'No pienso compartir.', 'Esto entra en la leyenda.'],
] as const;

const limits = [15, 35, 55, 75, 89, 99, 100];
const captions = [
  'Esta vez, mejor dejarlo pasar.', 'Había margen para bastante más.',
  'Correcto. Sin robarse la mesa.', 'Una buena elección.',
  'De los que apetece repetir.', 'La próxima vez ya sabes qué pedir.',
  'Un 100. No hace falta decir más.',
];

export function nextRepertoire(previous?: number) {
  const count = ratingRepertoires.length;
  return previous === undefined ? Math.floor(Math.random() * count)
    : (previous + 1 + Math.floor(Math.random() * (count - 1))) % count;
}

export function ratingCopy(value: number | null, repertoire: number) {
  const band = value === null ? -1 : limits.findIndex(limit => value <= limit);
  return band < 0
    ? { band, phrase: 'El veredicto es tuyo.', caption: 'Un pequeño gesto. Una gran opinión.' }
    : { band, phrase: ratingRepertoires[repertoire][band], caption: captions[band] };
}
