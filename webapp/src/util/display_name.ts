// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectCurrentDisplayName(state: any): string {
    const id = state?.entities?.users?.currentUserId;
    if (!id) {
        return '';
    }
    const u = state?.entities?.users?.profiles?.[id];
    if (!u) {
        return '';
    }
    const nick = (u.nickname ?? '').trim();
    if (nick) {
        return nick;
    }
    const full = ((u.first_name ?? '') + ' ' + (u.last_name ?? '')).trim();
    if (full) {
        return full;
    }
    return u.username ?? '';
}
