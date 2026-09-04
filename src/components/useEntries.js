import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase.js';

// Reads are direct from Firestore and scoped to this uid. Security Rules allow
// a user to read only their own subtree, so there is no query in this app that
// could return another person's rows even if it tried.

export function useEntries(uid) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    if (!uid) return setEntries([]);
    return onSnapshot(
      query(
        collection(db, 'users', uid, 'entries'),
        orderBy('createdAt', 'desc'),
      ),
      (snap) => setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setEntries([]),
    );
  }, [uid]);

  return entries;
}
