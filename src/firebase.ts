import { initializeApp } from "firebase/app";

// Firebase web config. These values identify the project; they are not
// secrets. Access is controlled by Firestore security rules, admin custom
// claims and server-side Cloud Functions.
const firebaseConfig = {
  apiKey: "AIzaSyAT2eWu8i2juMGNujrniiET_A-TWI1Gc9Q",
  authDomain: "sunday-showdown-fe8ec.firebaseapp.com",
  projectId: "sunday-showdown-fe8ec",
  storageBucket: "sunday-showdown-fe8ec.firebasestorage.app",
  messagingSenderId: "687372190996",
  appId: "1:687372190996:web:5801050140f79f45ebae01",
};

export const app = initializeApp(firebaseConfig);
