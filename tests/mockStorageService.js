let counter = 0;
export function uid() { return 'test_' + (++counter).toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
export function getActivityDate() { return new Date(); }
