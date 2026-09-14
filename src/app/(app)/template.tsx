/**
 * Transição entre páginas.
 *
 * Ao contrário do layout (que persiste), o template recebe uma chave única e
 * volta a montar em cada navegação — por isso é aqui que a entrada da página
 * corre sempre, e não só no primeiro carregamento. Os blocos de topo de cada
 * página surgem numa cascata curta (ver `.page-enter` em globals.css), que
 * respeita `prefers-reduced-motion`.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter space-y-5">{children}</div>;
}
