import {
    AuthenticationDetails,
    CognitoUser,
    CognitoUserPool,
} from "amazon-cognito-identity-js";
import * as SecureStore from "expo-secure-store";

const USER_POOL_ID = "ca-central-1_RrEKf0URO";
const CLIENT_ID = "3fc6pohma49bcsg0fqmqu6hoh9";

const pool = new CognitoUserPool({
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
});

const TOKEN_KEY = "intentify_id_token";

export async function signUp(email: string, password: string) {
  return new Promise<void>((resolve, reject) => {
    pool.signUp(email, password, [], [], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function signIn(email: string, password: string) {
  return new Promise<string>((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: pool });
    const auth = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    user.authenticateUser(auth, {
      onSuccess: async (result) => {
        const idToken = result.getIdToken().getJwtToken();
        await SecureStore.setItemAsync(TOKEN_KEY, idToken);
        resolve(idToken);
      },
      onFailure: (err) => reject(err),
    });
  });
}

export async function getIdToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function signOut() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
