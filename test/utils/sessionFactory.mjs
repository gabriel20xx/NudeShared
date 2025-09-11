// Session & auth related higher-level factories.
// Builds on top of authFactory (createUser/createAdminUser) to offer ready-to-use
// sessions for common roles without duplicating logic in tests.

import { createUser, createAdminUser } from './authFactory.mjs';

/** Create and return a normal authenticated session (user role) */
export async function sessionUser(appBase){
  return await createUser(appBase);
}

/** Create and return an authenticated admin session (role elevated + refreshed) */
export async function sessionAdmin(appBase){
  return await createAdminUser(appBase);
}

export default { sessionUser, sessionAdmin };
