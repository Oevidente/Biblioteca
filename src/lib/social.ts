import { 
  db, 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  getDoc, 
  query, 
  where, 
  orderBy, 
  updateDoc, 
  deleteDoc, 
  setDoc, 
  increment,
  writeBatch
} from "./firebase";
import { UserProfile } from "../contexts/AuthContext";

export interface ActivityItem {
  id?: string;
  uid: string;
  userName: string;
  userUsername?: string;
  userPhoto?: string;
  type: "read" | "published" | "badge" | "comment" | "friend" | "follow";
  title: string;
  targetId?: string;
  targetTitle?: string;
  details?: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  recipientUid: string;
  senderUid: string;
  senderName: string;
  senderUsername: string;
  senderPhoto?: string;
  type: "friend_request" | "friend_accepted" | "follow" | "system";
  status: "unread" | "read";
  message?: string;
  requestId?: string;
  createdAt: string;
}

export interface FriendRequest {
  id: string;
  senderUid: string;
  receiverUid: string;
  senderName: string;
  senderUsername: string;
  senderPhoto?: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
}

// Search users by display name or username
export async function searchUsers(searchTerm: string, currentUid?: string): Promise<UserProfile[]> {
  const clean = searchTerm.trim().toLowerCase().replace(/^@/, "");

  try {
    const usersRef = collection(db, "users");
    const snap = await getDocs(usersRef);
    const results: UserProfile[] = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data() as UserProfile;
      if (currentUid && data.uid === currentUid) return;

      if (!clean) {
        results.push(data);
        return;
      }

      const nameMatch = (data.displayName || "").toLowerCase().includes(clean);
      const userMatch = (data.username || "").toLowerCase().includes(clean);
      const emailMatch = (data.email || "").toLowerCase().includes(clean);

      if (nameMatch || userMatch || emailMatch) {
        results.push(data);
      }
    });

    return results.slice(0, 20);
  } catch (error) {
    console.error("Error searching users:", error);
    return [];
  }
}

// Get user profile by username or UID
export async function fetchProfileByUsername(username: string): Promise<UserProfile | null> {
  const clean = username.trim().toLowerCase().replace(/^@/, "");
  if (!clean) return null;

  try {
    const q = query(collection(db, "users"), where("username", "==", clean));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error("Error fetching profile by username:", error);
    return null;
  }
}

export async function fetchProfileByUid(uid: string): Promise<UserProfile | null> {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error("Error fetching profile by uid:", error);
    return null;
  }
}

// Follow / Unfollow logic
export async function followUser(followerUid: string, targetUid: string, followerProfile: UserProfile): Promise<boolean> {
  if (!followerUid || !targetUid || followerUid === targetUid) return false;

  try {
    const followId = `${followerUid}_${targetUid}`;
    const followRef = doc(db, "follows", followId);
    await setDoc(followRef, {
      followerUid,
      followingUid: targetUid,
      createdAt: new Date().toISOString()
    });

    // Update counts
    await updateDoc(doc(db, "users", followerUid), { followingCount: increment(1) }).catch(() => {});
    await updateDoc(doc(db, "users", targetUid), { followersCount: increment(1) }).catch(() => {});

    // Create Notification
    await addDoc(collection(db, "notifications"), {
      recipientUid: targetUid,
      senderUid: followerUid,
      senderName: followerProfile.displayName || followerProfile.email.split("@")[0],
      senderUsername: followerProfile.username || "",
      senderPhoto: followerProfile.photoURL || "",
      type: "follow",
      status: "unread",
      message: "começou a seguir você.",
      createdAt: new Date().toISOString()
    });

    // Log Activity
    await logUserActivity({
      uid: followerUid,
      userName: followerProfile.displayName || followerProfile.email.split("@")[0],
      userUsername: followerProfile.username,
      userPhoto: followerProfile.photoURL,
      type: "follow",
      title: "Começou a seguir um novo usuário",
      createdAt: new Date().toISOString()
    });

    return true;
  } catch (error) {
    console.error("Error following user:", error);
    return false;
  }
}

export async function unfollowUser(followerUid: string, targetUid: string): Promise<boolean> {
  if (!followerUid || !targetUid) return false;

  try {
    const followId = `${followerUid}_${targetUid}`;
    await deleteDoc(doc(db, "follows", followId));

    await updateDoc(doc(db, "users", followerUid), { followingCount: increment(-1) }).catch(() => {});
    await updateDoc(doc(db, "users", targetUid), { followersCount: increment(-1) }).catch(() => {});

    return true;
  } catch (error) {
    console.error("Error unfollowing user:", error);
    return false;
  }
}

export async function checkIsFollowing(followerUid: string, targetUid: string): Promise<boolean> {
  if (!followerUid || !targetUid) return false;
  try {
    const followId = `${followerUid}_${targetUid}`;
    const snap = await getDoc(doc(db, "follows", followId));
    return snap.exists();
  } catch (error) {
    return false;
  }
}

// Friend Request System
export async function sendFriendRequest(senderProfile: UserProfile, targetUid: string): Promise<{ success: boolean; error?: string }> {
  if (!senderProfile?.uid || !targetUid || senderProfile.uid === targetUid) {
    return { success: false, error: "Operação inválida." };
  }

  try {
    // Check existing pending request
    const qPending = query(
      collection(db, "friendRequests"),
      where("senderUid", "==", senderProfile.uid),
      where("receiverUid", "==", targetUid),
      where("status", "==", "pending")
    );
    const snapPending = await getDocs(qPending);
    if (!snapPending.empty) {
      return { success: false, error: "Solicitação de amizade já foi enviada." };
    }

    // Check if already friends
    const friendshipId = [senderProfile.uid, targetUid].sort().join("_");
    const snapFriend = await getDoc(doc(db, "friends", friendshipId));
    if (snapFriend.exists()) {
      return { success: false, error: "Vocês já são amigos." };
    }

    const reqRef = await addDoc(collection(db, "friendRequests"), {
      senderUid: senderProfile.uid,
      receiverUid: targetUid,
      senderName: senderProfile.displayName || senderProfile.email.split("@")[0],
      senderUsername: senderProfile.username || "",
      senderPhoto: senderProfile.photoURL || "",
      status: "pending",
      createdAt: new Date().toISOString()
    });

    // Create Notification for receiver
    await addDoc(collection(db, "notifications"), {
      recipientUid: targetUid,
      senderUid: senderProfile.uid,
      senderName: senderProfile.displayName || senderProfile.email.split("@")[0],
      senderUsername: senderProfile.username || "",
      senderPhoto: senderProfile.photoURL || "",
      type: "friend_request",
      status: "unread",
      requestId: reqRef.id,
      message: "enviou uma solicitação de amizade para você.",
      createdAt: new Date().toISOString()
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error sending friend request:", error);
    return { success: false, error: "Erro ao enviar solicitação de amizade." };
  }
}

export async function respondFriendRequest(
  requestId: string, 
  status: "accepted" | "rejected",
  recipientProfile: UserProfile
): Promise<boolean> {
  try {
    const reqRef = doc(db, "friendRequests", requestId);
    const reqSnap = await getDoc(reqRef);
    if (!reqSnap.exists()) return false;

    const reqData = reqSnap.data() as FriendRequest;
    await updateDoc(reqRef, { status });

    if (status === "accepted") {
      const friendshipId = [reqData.senderUid, reqData.receiverUid].sort().join("_");
      await setDoc(doc(db, "friends", friendshipId), {
        users: [reqData.senderUid, reqData.receiverUid],
        createdAt: new Date().toISOString()
      });

      // Increment friends counts
      await updateDoc(doc(db, "users", reqData.senderUid), { friendsCount: increment(1) }).catch(() => {});
      await updateDoc(doc(db, "users", reqData.receiverUid), { friendsCount: increment(1) }).catch(() => {});

      // Send acceptance notification to original sender
      await addDoc(collection(db, "notifications"), {
        recipientUid: reqData.senderUid,
        senderUid: recipientProfile.uid,
        senderName: recipientProfile.displayName || recipientProfile.email.split("@")[0],
        senderUsername: recipientProfile.username || "",
        senderPhoto: recipientProfile.photoURL || "",
        type: "friend_accepted",
        status: "unread",
        message: "aceitou sua solicitação de amizade! Agora vocês são amigos.",
        createdAt: new Date().toISOString()
      });

      // Log activity
      await logUserActivity({
        uid: recipientProfile.uid,
        userName: recipientProfile.displayName || recipientProfile.email.split("@")[0],
        userUsername: recipientProfile.username,
        userPhoto: recipientProfile.photoURL,
        type: "friend",
        title: "Aceitou uma solicitação de amizade",
        createdAt: new Date().toISOString()
      });
    }

    return true;
  } catch (error) {
    console.error("Error responding to friend request:", error);
    return false;
  }
}

export async function fetchUserFriendRequests(uid: string): Promise<FriendRequest[]> {
  try {
    const q = query(
      collection(db, "friendRequests"),
      where("receiverUid", "==", uid)
    );
    const snap = await getDocs(q);
    const items: FriendRequest[] = [];
    snap.forEach((docSnap) => {
      items.push({ id: docSnap.id, ...docSnap.data() } as FriendRequest);
    });
    return items;
  } catch (error) {
    console.error("Error fetching friend requests:", error);
    return [];
  }
}

export async function undoFriendRequest(
  requestId: string,
  recipientProfile: UserProfile
): Promise<boolean> {
  try {
    const reqRef = doc(db, "friendRequests", requestId);
    const reqSnap = await getDoc(reqRef);
    if (!reqSnap.exists()) return false;

    const reqData = reqSnap.data() as FriendRequest;
    
    // Set status of the request back to rejected (or we can delete/none)
    await updateDoc(reqRef, { status: "rejected" });

    // Identify the friendship document and delete it
    const friendshipId = [reqData.senderUid, reqData.receiverUid].sort().join("_");
    const friendshipRef = doc(db, "friends", friendshipId);
    const friendshipSnap = await getDoc(friendshipRef);
    if (friendshipSnap.exists()) {
      await deleteDoc(friendshipRef);
      // Decrement friends counts
      await updateDoc(doc(db, "users", reqData.senderUid), { friendsCount: increment(-1) }).catch(() => {});
      await updateDoc(doc(db, "users", reqData.receiverUid), { friendsCount: increment(-1) }).catch(() => {});
    }

    return true;
  } catch (error) {
    console.error("Error undoing friend request:", error);
    return false;
  }
}

export async function getFriendshipStatus(currentUid: string, targetUid: string): Promise<"friends" | "pending_sent" | "pending_received" | "none"> {
  if (!currentUid || !targetUid || currentUid === targetUid) return "none";

  try {
    // 1. Check friendship
    const friendshipId = [currentUid, targetUid].sort().join("_");
    const friendSnap = await getDoc(doc(db, "friends", friendshipId));
    if (friendSnap.exists()) return "friends";

    // 2. Check pending request sent by currentUid
    const qSent = query(
      collection(db, "friendRequests"),
      where("senderUid", "==", currentUid),
      where("receiverUid", "==", targetUid),
      where("status", "==", "pending")
    );
    const snapSent = await getDocs(qSent);
    if (!snapSent.empty) return "pending_sent";

    // 3. Check pending request received from targetUid
    const qReceived = query(
      collection(db, "friendRequests"),
      where("senderUid", "==", targetUid),
      where("receiverUid", "==", currentUid),
      where("status", "==", "pending")
    );
    const snapReceived = await getDocs(qReceived);
    if (!snapReceived.empty) return "pending_received";

    return "none";
  } catch (error) {
    return "none";
  }
}

// User Activities
export async function logUserActivity(activity: ActivityItem): Promise<void> {
  try {
    const activityData = {
      ...activity,
      createdAt: activity.createdAt || new Date().toISOString()
    };
    // Log once to global activities collection to save 50% write quota
    await addDoc(collection(db, "activities"), activityData);
  } catch (error) {
    console.warn("Could not log user activity (quota or network):", error);
  }
}

export async function fetchUserActivities(uid: string): Promise<ActivityItem[]> {
  try {
    const q = query(
      collection(db, "activities"),
      where("uid", "==", uid)
    );
    const snap = await getDocs(q);
    const items: ActivityItem[] = [];
    snap.forEach((docSnap) => {
      items.push({ id: docSnap.id, ...docSnap.data() } as ActivityItem);
    });
    return items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  } catch (error) {
    console.warn("Error fetching user activities:", error);
    return [];
  }
}

export async function fetchGlobalActivities(): Promise<ActivityItem[]> {
  try {
    const q = query(collection(db, "activities"));
    const snap = await getDocs(q);
    const items: ActivityItem[] = [];
    snap.forEach((docSnap) => {
      items.push({ id: docSnap.id, ...docSnap.data() } as ActivityItem);
    });
    // Sort client-side to ensure ordering even if Firestore index is building
    return items.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  } catch (error) {
    console.warn("Error fetching global activities:", error);
    return [];
  }
}

// Notifications
export async function fetchUserNotifications(uid: string): Promise<NotificationItem[]> {
  try {
    const q = query(
      collection(db, "notifications"),
      where("recipientUid", "==", uid)
    );
    const snap = await getDocs(q);
    const items: NotificationItem[] = [];
    snap.forEach((docSnap) => {
      items.push({ id: docSnap.id, ...docSnap.data() } as NotificationItem);
    });
    // Sort in memory by createdAt descending
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return [];
  }
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, "notifications", notificationId), { status: "read" });
  } catch (error) {
    console.warn("Error marking notification as read:", error);
  }
}

// User Reading History
export interface ReadingHistoryItem {
  id: string;
  storyId: string;
  storyTitle?: string;
  coverImage?: string;
  author?: string;
  page: number;
  totalPages: number;
  updatedAt: string;
}

export async function fetchUserReadingProgress(uid: string): Promise<ReadingHistoryItem[]> {
  try {
    const progressRef = collection(db, `users/${uid}/progress`);
    let snap;
    try {
      const q = query(progressRef, orderBy("updatedAt", "desc"));
      snap = await getDocs(q);
    } catch (e) {
      console.warn("Ordered query for reading progress failed, falling back to unordered getDocs:", e);
      snap = await getDocs(progressRef);
    }

    const items: ReadingHistoryItem[] = [];

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      let storyTitle = data.storyTitle;
      let coverImage = data.coverImage;
      let author = data.author;

      // Hydrate from story doc if missing
      if (!storyTitle || !coverImage || !author) {
        try {
          const storyDoc = await getDoc(doc(db, "stories", data.storyId));
          if (storyDoc.exists()) {
            const sData = storyDoc.data();
            storyTitle = storyTitle || sData.title;
            coverImage = coverImage || sData.coverImage;
            author = author || sData.author;
          }
        } catch (e) {}
      }

      items.push({
        id: docSnap.id,
        storyId: data.storyId,
        storyTitle: storyTitle || "História",
        coverImage: coverImage || "",
        author: author || "Autor",
        page: data.page || 1,
        totalPages: data.totalPages || 1,
        updatedAt: data.updatedAt || new Date().toISOString()
      });
    }

    // Sort items by updatedAt
    items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    // If Firestore returned no items, check local storage cache
    if (items.length === 0) {
      try {
        const localHistStr = localStorage.getItem(`reading_history_${uid}`);
        if (localHistStr) {
          const localHist = JSON.parse(localHistStr);
          if (Array.isArray(localHist)) {
            for (const item of localHist) {
              if (item.storyId || item.id) {
                items.push({
                  id: item.id || item.storyId,
                  storyId: item.storyId || item.id,
                  storyTitle: item.title || item.storyTitle || "História",
                  coverImage: item.coverImage || "",
                  author: item.author || "Autor",
                  page: item.page || 1,
                  totalPages: item.totalPages || 1,
                  updatedAt: item.timestamp || item.updatedAt || new Date().toISOString()
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn("Error reading local reading_history:", e);
      }
    }

    return items;
  } catch (error) {
    console.error("Error fetching reading progress:", error);
    return [];
  }
}

// User Published Stories
export async function fetchUserPublishedStories(
  uid: string,
  profileInfo?: string | { displayName?: string; username?: string; email?: string }
): Promise<any[]> {
  try {
    const storiesRef = collection(db, "stories");
    
    // Build array of identifiers to match against story.author or story.authorUid
    const namesToMatch: string[] = [];
    if (typeof profileInfo === "string") {
      if (profileInfo.trim()) {
        const clean = profileInfo.trim().toLowerCase();
        namesToMatch.push(clean);
        if (clean.startsWith("@")) {
          namesToMatch.push(clean.slice(1));
        } else {
          namesToMatch.push(`@${clean}`);
        }
      }
    } else if (profileInfo) {
      if (profileInfo.displayName?.trim()) {
        namesToMatch.push(profileInfo.displayName.trim().toLowerCase());
      }
      if (profileInfo.username?.trim()) {
        const cleanUser = profileInfo.username.trim().replace(/^@/, "").toLowerCase();
        namesToMatch.push(cleanUser);
        namesToMatch.push(`@${cleanUser}`);
      }
      if (profileInfo.email?.trim()) {
        const cleanEmail = profileInfo.email.trim().toLowerCase();
        namesToMatch.push(cleanEmail);
        const emailPrefix = cleanEmail.split("@")[0];
        if (emailPrefix) namesToMatch.push(emailPrefix);
      }
    }

    const matchedMap = new Map<string, any>();

    // 1. First query by authorUid
    if (uid) {
      try {
        const qUid = query(storiesRef, where("authorUid", "==", uid));
        const snapUid = await getDocs(qUid);
        snapUid.forEach((d) => matchedMap.set(d.id, { id: d.id, ...d.data() }));
      } catch (e) {
        console.warn("Query by authorUid failed, falling back to full scan:", e);
      }
    }

    // 2. Scan all stories to catch stories where authorUid is missing or author name matches username/displayName
    try {
      const allSnap = await getDocs(storiesRef);
      for (const docSnap of allSnap.docs) {
        const data = docSnap.data();
        const storyId = docSnap.id;

        if (matchedMap.has(storyId)) continue;

        const storyAuthorUid = data.authorUid;
        const storyAuthor = (data.author || "").toString().trim().toLowerCase();
        const cleanStoryAuthorWithoutAt = storyAuthor.replace(/^@/, "");

        let isMatch = false;

        if (uid && storyAuthorUid === uid) {
          isMatch = true;
        } else if (namesToMatch.length > 0) {
          if (
            namesToMatch.includes(storyAuthor) ||
            namesToMatch.includes(cleanStoryAuthorWithoutAt)
          ) {
            isMatch = true;

            // Backfill authorUid in Firestore so future queries are permanent
            if (uid) {
              try {
                await updateDoc(doc(db, "stories", storyId), { authorUid: uid });
              } catch (e) {
                console.warn(`Could not backfill authorUid for story ${storyId}:`, e);
              }
            }
          }
        }

        if (isMatch) {
          matchedMap.set(storyId, { id: storyId, ...data, authorUid: uid || storyAuthorUid });
        }
      }
    } catch (e) {
      console.warn("Full scan of stories failed:", e);
    }

    // 3. Fallback: check local storage cache if firestore returned nothing
    if (matchedMap.size === 0) {
      try {
        const cached = localStorage.getItem("luminary_cached_stories");
        if (cached) {
          const list = JSON.parse(cached);
          for (const item of list) {
            const sUid = item.authorUid;
            const sAuthor = (item.author || "").toString().trim().toLowerCase();
            const cleanSAuthor = sAuthor.replace(/^@/, "");

            if (
              (uid && sUid === uid) ||
              (namesToMatch.length > 0 &&
                (namesToMatch.includes(sAuthor) || namesToMatch.includes(cleanSAuthor)))
            ) {
              if (item.id) matchedMap.set(item.id, item);
            }
          }
        }
      } catch (e) {
        console.warn("Error reading cached stories:", e);
      }
    }

    return Array.from(matchedMap.values());
  } catch (error) {
    console.error("Error fetching published stories:", error);
    return [];
  }
}

// User Followers / Following / Friends List
export async function fetchUserFriendsList(uid: string): Promise<UserProfile[]> {
  try {
    const q = query(collection(db, "friends"), where("users", "array-contains", uid));
    const snap = await getDocs(q);
    const friendUids: string[] = [];

    snap.forEach((d) => {
      const users: string[] = d.data().users || [];
      const other = users.find((id) => id !== uid);
      if (other) friendUids.push(other);
    });

    const profiles: UserProfile[] = [];
    for (const friendUid of friendUids) {
      const p = await fetchProfileByUid(friendUid);
      if (p) profiles.push(p);
    }

    return profiles;
  } catch (error) {
    console.error("Error fetching friends list:", error);
    return [];
  }
}

export async function fetchUserFollowersList(uid: string): Promise<UserProfile[]> {
  try {
    const q = query(collection(db, "follows"), where("followingUid", "==", uid));
    const snap = await getDocs(q);
    const profiles: UserProfile[] = [];

    for (const d of snap.docs) {
      const followerUid = d.data().followerUid;
      const p = await fetchProfileByUid(followerUid);
      if (p) profiles.push(p);
    }

    return profiles;
  } catch (error) {
    console.error("Error fetching followers list:", error);
    return [];
  }
}

export async function fetchUserFollowingList(uid: string): Promise<UserProfile[]> {
  try {
    const q = query(collection(db, "follows"), where("followerUid", "==", uid));
    const snap = await getDocs(q);
    const profiles: UserProfile[] = [];

    for (const d of snap.docs) {
      const targetUid = d.data().followingUid;
      const p = await fetchProfileByUid(targetUid);
      if (p) profiles.push(p);
    }

    return profiles;
  } catch (error) {
    console.error("Error fetching following list:", error);
    return [];
  }
}
