let _seq = 0;
export const uid = () => "id" + Date.now().toString(36) + (_seq++).toString(36);
