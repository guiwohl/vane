import type { ElementTable, RenderElement } from "claude-code";

export type StickyWindow<Row> = {
  offset: number;
  bodyRows: number;
  rowsAbove: number;
  header: RenderElement;
  headerRows: number;
  rows: Row[];
  drawRows: (visible: Row[], firstIndex: number) => RenderElement[];
};

export function stickyWindow<Row>({ Box }: ElementTable, view: StickyWindow<Row>): RenderElement {
  const visibleRows = Math.max(1, view.bodyRows - view.headerRows);
  const lastShift = Math.max(0, view.rows.length - visibleRows);
  const shift = Math.min(Math.max(0, view.offset - view.rowsAbove), lastShift);
  const drawn = view.rows.slice(shift, shift + visibleRows);
  const below = view.rows.length - shift - drawn.length;
  return (
    <Box flexDirection="column">
      {shift > 0 ? <Box height={shift} /> : null}
      {view.header}
      {view.drawRows(drawn, shift)}
      {below > 0 ? <Box height={below} /> : null}
    </Box>
  );
}
