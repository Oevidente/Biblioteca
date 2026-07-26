import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  const snap = await getDocs(collection(db, 'stories'));
  const allTags = new Set();
  snap.forEach(doc => {
    const data = doc.data();
    if (data.tags) {
      data.tags.forEach(t => allTags.add(t));
    }
  });
  console.log("All tags in DB:");
  console.log(Array.from(allTags));
  process.exit(0);
}
run();
