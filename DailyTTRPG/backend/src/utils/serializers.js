export function serializeAccount(account) {
  if (!account) {
    return null;
  }

  const { password_hash, ...safeAccount } = account;
  return safeAccount;
}
