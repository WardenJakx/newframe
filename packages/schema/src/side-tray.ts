export const SIDE_TRAY_FRAME_ID = 'sideTray'

export type SideTrayRouteName = 'send' | 'trade'

export interface SideTrayRoute {
  name: SideTrayRouteName
  searchParams: URLSearchParams
}

export interface SideTrayFrame {
  id: typeof SIDE_TRAY_FRAME_ID
  route?: string
}
