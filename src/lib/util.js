let _seq = 0;
export const uid = () => "id" + Date.now().toString(36) + (_seq++).toString(36);

export function arrayMove(arr, from, to) {
  const a = arr.slice();
  const [it] = a.splice(from, 1);
  a.splice(to, 0, it);
  return a;
}
