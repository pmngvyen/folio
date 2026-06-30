import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, collection, getDocs,
  deleteDoc, writeBatch, serverTimestamp, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ⚠️ Replace these values with YOUR Firebase project config
// (Firebase console → Project settings → scroll to "Your apps")
const firebaseConfig = {
  apiKey: "AIzaSyB8h0HD_hTjQdQn5AnKEqKpOCNHV9NMY1U",
  authDomain: "folio-tracker-c39e5.firebaseapp.com",
  projectId: "folio-tracker-c39e5",
  storageBucket: "folio-tracker-c39e5.firebasestorage.app",
  messagingSenderId: "353210624507",
  appId: "1:353210624507:web:4831c98a8c8a9de04f435e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Expose what the main script needs on window, since the main script
// is a plain (non-module) script and can't use ES import syntax directly.
window.__firebase = {
  auth, db,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, updateProfile,
  doc, setDoc, getDoc, collection, getDocs, deleteDoc, writeBatch, serverTimestamp,
  query, where
};

// Signal to the main script that Firebase is ready
window.dispatchEvent(new Event('firebase-ready'));
</script>
