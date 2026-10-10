import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, 'server_data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  avatar?: string;
  favoriteStyles?: string[];
  favoriteColors?: string[];
  googleLinked?: boolean;
  googleEmail?: string;
  googleId?: string;
  createdAt: string;
}

export interface StoredLookbookItem {
  id: string;
  userId: string;
  outfitName: string;
  imageUrl: string;
  outfitData: any;
  createdAt: string;
}

export interface StoredHistoryItem {
  id: string;
  userId: string;
  actionType: 'stylist' | 'search' | 'generate_image';
  query?: string;
  preferences?: any;
  outfits?: any[];
  selectedOutfit?: any;
  imageUrl?: string;
  createdAt: string;
}

interface DatabaseSchema {
  users: StoredUser[];
  lookbooks: StoredLookbookItem[];
  history: StoredHistoryItem[];
}

export const DEFAULT_DEMO_USER: StoredUser = {
  id: 'usr_demo_01',
  email: 'demo@vietphucremix.vn',
  passwordHash: bcrypt.hashSync('vietphuc2025', 10),
  name: 'Nguyễn Hoàng Nam',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
  favoriteStyles: ['Modern Streetwear', 'Cổ phục Hoàng Cung'],
  favoriteColors: ['Đỏ Đô', 'Vàng Cát', 'Xanh Lam Cổ'],
  createdAt: '2025-01-01T00:00:00.000Z',
};

function ensureDbFile(): DatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch (dirErr) {
        console.warn('Cannot create DATA_DIR, using memory mode:', dirErr);
      }
    }

    let data: DatabaseSchema;

    if (!fs.existsSync(DB_FILE)) {
      data = {
        users: [{ ...DEFAULT_DEMO_USER }],
        lookbooks: [],
        history: [],
      };
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
      } catch (writeErr) {
        console.warn('Cannot write initial DB_FILE, operating in memory:', writeErr);
      }
      return data;
    }

    const content = fs.readFileSync(DB_FILE, 'utf-8');
    data = JSON.parse(content);

    // Auto-heal demo account: ensure demo@vietphucremix.vn exists and its password is valid
    let demoIndex = data.users.findIndex((u) => u.email.toLowerCase() === 'demo@vietphucremix.vn');
    if (demoIndex === -1) {
      data.users.unshift({ ...DEFAULT_DEMO_USER });
      saveDb(data);
    } else {
      const demoUser = data.users[demoIndex];
      // If the password hash does not match 'vietphuc2025', heal it immediately!
      if (!bcrypt.compareSync('vietphuc2025', demoUser.passwordHash)) {
        demoUser.passwordHash = bcrypt.hashSync('vietphuc2025', 10);
        saveDb(data);
      }
    }

    return data;
  } catch (err) {
    console.error('Database read issue, initializing resilient fallback with demo account:', err);
    return {
      users: [{ ...DEFAULT_DEMO_USER }],
      lookbooks: [],
      history: [],
    };
  }
}

function saveDb(data: DatabaseSchema) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.warn('Failed to write database file to disk, state retained in memory:', err);
  }
}

export const serverDb = {
  // Users
  findUserByEmail(email: string): StoredUser | undefined {
    const clean = email.trim().toLowerCase();
    const db = ensureDbFile();
    let user = db.users.find((u) => u.email.toLowerCase() === clean);
    if (!user && (clean === 'demo@vietphucremix.vn' || clean === 'demo@vietphucremix.com')) {
      user = { ...DEFAULT_DEMO_USER };
      db.users.unshift(user);
      saveDb(db);
    }
    return user;
  },

  findUserById(id: string): StoredUser | undefined {
    const db = ensureDbFile();
    let user = db.users.find((u) => u.id === id);
    if (!user && id === 'usr_demo_01') {
      user = { ...DEFAULT_DEMO_USER };
    }
    return user;
  },

  createUser(user: { email: string; password: string; name: string }): StoredUser {
    const db = ensureDbFile();
    const existing = db.users.find((u) => u.email.toLowerCase() === user.email.trim().toLowerCase());
    if (existing) {
      throw new Error('Email đã được đăng ký trên hệ thống.');
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(user.password, salt);

    const newUser: StoredUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      email: user.email.trim().toLowerCase(),
      passwordHash,
      name: user.name.trim(),
      favoriteStyles: ['Contemporary Streetwear', 'Hài hòa truyền thống'],
      favoriteColors: ['Đỏ Trầm (Burgundy)', 'Vàng Hoàng Cung (Gold)'],
      createdAt: new Date().toISOString(),
    };

    db.users.push(newUser);
    saveDb(db);
    return newUser;
  },

  findOrCreateGoogleUser(email: string, name: string, avatar?: string, googleId?: string): StoredUser {
    const db = ensureDbFile();
    const cleanEmail = email.trim().toLowerCase();
    let user = db.users.find((u) => u.email.toLowerCase() === cleanEmail);

    if (user) {
      // Account exists: link Google account to it
      user.googleLinked = true;
      user.googleEmail = cleanEmail;
      if (googleId) user.googleId = googleId;
      if (avatar && (!user.avatar || user.avatar.includes('unsplash'))) {
        user.avatar = avatar;
      }
      if (name && (!user.name || user.name === 'Thành viên mới' || user.name === 'Khách hàng Google')) {
        user.name = name.trim();
      }
      saveDb(db);
    } else {
      const salt = bcrypt.genSaltSync(10);
      const dummyHash = bcrypt.hashSync(Math.random().toString(36), salt);
      user = {
        id: `usr_g_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        email: cleanEmail,
        passwordHash: dummyHash,
        name: name.trim() || 'Thành viên Google',
        avatar: avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
        favoriteStyles: ['Modern Heritage', 'Smart Casual'],
        favoriteColors: ['Burgundy', 'Trắng ngà'],
        googleLinked: true,
        googleEmail: cleanEmail,
        googleId,
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
      saveDb(db);
    }
    return user;
  },

  linkGoogleAccount(
    userId: string,
    googleData: { email: string; name?: string; avatar?: string; googleId?: string }
  ): StoredUser {
    const db = ensureDbFile();
    const user = db.users.find((u) => u.id === userId);
    if (!user) {
      throw new Error('Người dùng không tồn tại.');
    }

    user.googleLinked = true;
    user.googleEmail = googleData.email.trim().toLowerCase();
    if (googleData.googleId) user.googleId = googleData.googleId;
    if (googleData.avatar) user.avatar = googleData.avatar;
    if (googleData.name && (!user.name || user.name === 'Thành viên mới')) {
      user.name = googleData.name.trim();
    }

    saveDb(db);
    return user;
  },

  unlinkGoogleAccount(userId: string): StoredUser {
    const db = ensureDbFile();
    const user = db.users.find((u) => u.id === userId);
    if (!user) {
      throw new Error('Người dùng không tồn tại.');
    }

    user.googleLinked = false;
    delete user.googleEmail;
    delete user.googleId;

    saveDb(db);
    return user;
  },

  updateUserProfile(
    userId: string,
    updates: Partial<Pick<StoredUser, 'name' | 'avatar' | 'favoriteStyles' | 'favoriteColors'>>
  ): StoredUser {
    const db = ensureDbFile();
    const userIndex = db.users.findIndex((u) => u.id === userId);
    if (userIndex === -1) {
      throw new Error('Không tìm thấy người dùng.');
    }

    if (updates.name !== undefined) db.users[userIndex].name = updates.name.trim();
    if (updates.avatar !== undefined) db.users[userIndex].avatar = updates.avatar.trim();
    if (updates.favoriteStyles !== undefined) db.users[userIndex].favoriteStyles = updates.favoriteStyles;
    if (updates.favoriteColors !== undefined) db.users[userIndex].favoriteColors = updates.favoriteColors;

    saveDb(db);
    return db.users[userIndex];
  },

  // Lookbooks (strictly isolated by userId)
  getUserLookbooks(userId: string): StoredLookbookItem[] {
    const db = ensureDbFile();
    return db.lookbooks.filter((item) => item.userId === userId).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  },

  addLookbookItem(userId: string, outfitName: string, imageUrl: string, outfitData: any): StoredLookbookItem {
    const db = ensureDbFile();
    const newItem: StoredLookbookItem = {
      id: `lb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId,
      outfitName: outfitName || 'Việt Phục Remix Look',
      imageUrl: imageUrl || '',
      outfitData: outfitData || {},
      createdAt: new Date().toISOString(),
    };
    db.lookbooks.push(newItem);
    saveDb(db);
    return newItem;
  },

  removeLookbookItem(userId: string, itemId: string): boolean {
    const db = ensureDbFile();
    const initialLen = db.lookbooks.length;
    // Row level restriction: only delete if userId matches!
    db.lookbooks = db.lookbooks.filter((item) => !(item.id === itemId && item.userId === userId));
    const removed = db.lookbooks.length < initialLen;
    if (removed) saveDb(db);
    return removed;
  },

  // History (strictly isolated by userId)
  getUserHistory(userId: string): StoredHistoryItem[] {
    const db = ensureDbFile();
    return db.history.filter((h) => h.userId === userId).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  },

  addHistoryItem(userId: string, item: Omit<StoredHistoryItem, 'id' | 'userId' | 'createdAt'>): StoredHistoryItem {
    const db = ensureDbFile();
    const newRecord: StoredHistoryItem = {
      id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId,
      actionType: item.actionType,
      query: item.query,
      preferences: item.preferences,
      outfits: item.outfits,
      selectedOutfit: item.selectedOutfit,
      imageUrl: item.imageUrl,
      createdAt: new Date().toISOString(),
    };
    db.history.unshift(newRecord);
    // Keep last 100 history items per user
    const userHistories = db.history.filter((h) => h.userId === userId);
    if (userHistories.length > 100) {
      const oldestToPrune = userHistories.slice(100);
      const pruneIds = new Set(oldestToPrune.map((x) => x.id));
      db.history = db.history.filter((h) => !pruneIds.has(h.id));
    }
    saveDb(db);
    return newRecord;
  },

  deleteHistoryItem(userId: string, historyId: string): boolean {
    const db = ensureDbFile();
    const initialLen = db.history.length;
    db.history = db.history.filter((h) => !(h.id === historyId && h.userId === userId));
    const removed = db.history.length < initialLen;
    if (removed) saveDb(db);
    return removed;
  },

  clearUserHistory(userId: string): boolean {
    const db = ensureDbFile();
    db.history = db.history.filter((h) => h.userId !== userId);
    saveDb(db);
    return true;
  },
};
