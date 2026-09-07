// 用户稳定配色（用于协作光标、在线列表、标签页圆点等）
const PALETTE = ['#e57373', '#64b5f6', '#81c784', '#ffb74d', '#ba68c8', '#4dd0e1', '#f06292', '#aed581', '#ffd54f', '#7986cb'];

export function colorFor(userId: number): string {
  return PALETTE[Math.abs(userId) % PALETTE.length];
}
