import { supabase } from './supabaseClient';

// Simple Mock Encryption: Base64 encoding prefixed with __aes256__
const encrypt = (text) => {
  if (typeof text !== 'string') text = JSON.stringify(text);
  return `__aes256::${btoa(encodeURIComponent(text))}`;
};

const decrypt = (encryptedText) => {
  if (typeof encryptedText !== 'string' || !encryptedText.startsWith('__aes256::')) {
    return encryptedText;
  }
  try {
    const raw = encryptedText.substring(10);
    const decoded = decodeURIComponent(atob(raw));
    try {
      return JSON.parse(decoded);
    } catch {
      return decoded;
    }
  } catch (e) {
    console.error('Failed to decrypt:', e);
    return null;
  }
};

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Default setup data if empty
const DEFAULT_USER_ID = 'user-mizan-12345';
const DEFAULT_USER = {
  user_id: DEFAULT_USER_ID,
  username: 'Firza Gustama',
  email: 'firza@example.com',
  password: 'password123',
  profiling_data: {
    campus: 'Universitas Indonesia',
    semester: 4,
    major: 'Teknik Informatika',
    monthly_allowance: 2500000
  },
  created_at: new Date('2026-06-01').toISOString()
};

const DEFAULT_BUDGET = {
  plan_id: 'plan-default',
  user_id: DEFAULT_USER_ID,
  allocation_ratio: { dharuriyat: 50, hajiyat: 20, tahsiniyat: 10, saving: 20 },
  limit_alert: 450000,
  monthly_budget: 2000000
};

const INITIAL_TRANSACTIONS = [];
const INITIAL_WORSHIP = [];
const INITIAL_HEALTH = [];
const INITIAL_TARGETS = [];


export const initDB = () => {
  if (!localStorage.getItem('mizan_users')) {
    localStorage.setItem('mizan_users', JSON.stringify([encrypt(DEFAULT_USER)]));
    localStorage.setItem('mizan_budgets', JSON.stringify([encrypt(DEFAULT_BUDGET)]));
    localStorage.setItem('mizan_transactions', JSON.stringify(INITIAL_TRANSACTIONS.map(t => encrypt(t))));
    localStorage.setItem('mizan_worship', JSON.stringify(INITIAL_WORSHIP.map(w => encrypt(w))));
    localStorage.setItem('mizan_health', JSON.stringify(INITIAL_HEALTH.map(h => encrypt(h))));
    localStorage.setItem('mizan_worship_targets', JSON.stringify(INITIAL_TARGETS.map(t => encrypt(t))));
    localStorage.setItem('mizan_obligations', JSON.stringify([]));
    
    localStorage.setItem('mizan_syariah', JSON.stringify([encrypt({
      eval_id: 'eval-default',
      user_id: DEFAULT_USER_ID,
      score_israf: 95,
      reminder_status: false,
      last_evaluated: new Date().toISOString()
    })]));
    
    localStorage.setItem('mizan_logs', JSON.stringify([
      encrypt({
        log_id: generateUUID(),
        user_id: DEFAULT_USER_ID,
        action_type: 'User_Registration',
        device_info: { os: 'Android', brand: 'Xiaomi', model: 'Redmi Note 12' },
        ip_address: '192.168.1.5',
        timestamp: new Date('2026-06-01T08:00:00Z').toISOString()
      }),
      encrypt({
        log_id: generateUUID(),
        user_id: DEFAULT_USER_ID,
        action_type: 'User_Login',
        device_info: { os: 'Android', brand: 'Xiaomi', model: 'Redmi Note 12' },
        ip_address: '192.168.1.5',
        timestamp: new Date('2026-06-01T08:05:00Z').toISOString()
      })
    ]));
  }
};

export const syncFromSupabase = async () => {
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseAnonKey || supabaseAnonKey === 'YOUR_SUPABASE_ANON_KEY_HERE' || supabaseAnonKey === 'placeholder-key') {
    console.log('Using mock database. Supabase Anon Key is placeholder.');
    return;
  }
  
  try {
    console.log('Syncing data from Supabase...');
    
    // Pull users
    const { data: usersData, error: uError } = await supabase.from('users').select('*');
    if (!uError && usersData && usersData.length > 0) {
      localStorage.setItem('mizan_users', JSON.stringify(usersData.map(u => encrypt(u))));
    }
    
    // Pull budgets
    const { data: budgetsData, error: bError } = await supabase.from('budgets').select('*');
    if (!bError && budgetsData && budgetsData.length > 0) {
      localStorage.setItem('mizan_budgets', JSON.stringify(budgetsData.map(b => encrypt({
        plan_id: b.plan_id,
        user_id: b.user_id,
        allocation_ratio: b.allocation_ratio,
        limit_alert: parseFloat(b.limit_alert),
        monthly_budget: parseFloat(b.monthly_budget)
      }))));
    }

    // Pull transactions
    const { data: txsData, error: tError } = await supabase.from('transactions').select('*');
    if (!tError && txsData && txsData.length > 0) {
      localStorage.setItem('mizan_transactions', JSON.stringify(txsData.map(t => encrypt({
        trans_id: t.trans_id,
        user_id: t.user_id,
        amount: parseFloat(t.amount),
        category: t.category,
        priority_tag: t.priority_tag,
        transaction_type: t.transaction_type,
        date: t.date
      }))));
    }

    // Pull worship logs
    const { data: worshipData, error: wError } = await supabase.from('worship_logs').select('*');
    if (!wError && worshipData && worshipData.length > 0) {
      localStorage.setItem('mizan_worship', JSON.stringify(worshipData.map(w => encrypt(w))));
    }

    // Pull health logs
    const { data: healthData, error: hError } = await supabase.from('health_logs').select('*');
    if (!hError && healthData && healthData.length > 0) {
      localStorage.setItem('mizan_health', JSON.stringify(healthData.map(h => encrypt(h))));
    }

    // Pull worship targets
    const { data: targetsData, error: tgError } = await supabase.from('worship_targets').select('*');
    if (!tgError && targetsData && targetsData.length > 0) {
      localStorage.setItem('mizan_worship_targets', JSON.stringify(targetsData.map(tg => encrypt({
        target_id: tg.target_id,
        user_id: tg.user_id,
        title: tg.title,
        target_amount: parseFloat(tg.target_amount),
        current_amount: parseFloat(tg.current_amount),
        deadline: tg.deadline
      }))));
    }
    
    // Pull obligations
    try {
      const { data: obligationsData, error: obError } = await supabase.from('obligations').select('*');
      if (!obError && obligationsData && obligationsData.length > 0) {
        localStorage.setItem('mizan_obligations', JSON.stringify(obligationsData.map(o => encrypt(o))));
      }
    } catch (e) {
      console.error('Supabase obligations sync error:', e);
    }
    
    console.log('Supabase sync complete.');
  } catch (e) {
    console.error('Error syncing from Supabase:', e);
  }
};

export const getRawStorageData = (key) => {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
};

// Database CRUD Actions (with automatic Encryption/Decryption)
export const db = {
  users: {
    get: (id) => {
      const users = JSON.parse(localStorage.getItem('mizan_users') || '[]').map(u => decrypt(u));
      return users.find(u => u.user_id === id) || null;
    },
    update: (id, data) => {
      const users = JSON.parse(localStorage.getItem('mizan_users') || '[]').map(u => decrypt(u));
      const idx = users.findIndex(u => u.user_id === id);
      if (idx !== -1) {
        users[idx] = { ...users[idx], ...data };
        localStorage.setItem('mizan_users', JSON.stringify(users.map(u => encrypt(u))));
        
        // Background sync to Supabase
        supabase.from('users').upsert({
          user_id: id,
          username: users[idx].username,
          email: users[idx].email,
          password: users[idx].password,
          profiling_data: users[idx].profiling_data,
          created_at: users[idx].created_at
        }).then(({ error }) => {
          if (error) console.error('Supabase user upsert error:', error);
        });
        
        return users[idx];
      }
      return null;
    }
  },
  transactions: {
    list: (userId) => {
      const txs = JSON.parse(localStorage.getItem('mizan_transactions') || '[]').map(t => decrypt(t));
      return txs.filter(t => t.user_id === userId).sort((a, b) => new Date(b.date) - new Date(a.date));
    },
    add: (userId, tx) => {
      const txs = JSON.parse(localStorage.getItem('mizan_transactions') || '[]').map(t => decrypt(t));
      const newTx = {
        trans_id: generateUUID(),
        user_id: userId,
        amount: parseFloat(tx.amount),
        category: tx.category,
        priority_tag: tx.priority_tag,
        transaction_type: tx.transaction_type,
        date: tx.date || new Date().toISOString().split('T')[0]
      };
      txs.push(newTx);
      localStorage.setItem('mizan_transactions', JSON.stringify(txs.map(t => encrypt(t))));
      
      // Background sync to Supabase
      supabase.from('transactions').insert({
        trans_id: newTx.trans_id,
        user_id: newTx.user_id,
        amount: newTx.amount,
        category: newTx.category,
        priority_tag: newTx.priority_tag,
        transaction_type: newTx.transaction_type,
        date: newTx.date
      }).then(({ error }) => {
        if (error) console.error('Supabase transaction insert error:', error);
      });
      
      return newTx;
    },
    delete: (transId) => {
      const txs = JSON.parse(localStorage.getItem('mizan_transactions') || '[]').map(t => decrypt(t));
      const filtered = txs.filter(t => t.trans_id !== transId);
      localStorage.setItem('mizan_transactions', JSON.stringify(filtered.map(t => encrypt(t))));
      
      // Background sync to Supabase
      supabase.from('transactions').delete().eq('trans_id', transId)
        .then(({ error }) => {
          if (error) console.error('Supabase transaction delete error:', error);
        });
      
      return true;
    },
    update: (transId, data) => {
      const txs = JSON.parse(localStorage.getItem('mizan_transactions') || '[]').map(t => decrypt(t));
      const idx = txs.findIndex(t => t.trans_id === transId);
      if (idx !== -1) {
        txs[idx] = { ...txs[idx], ...data, amount: parseFloat(data.amount) };
        localStorage.setItem('mizan_transactions', JSON.stringify(txs.map(t => encrypt(t))));
        
        // Background sync to Supabase
        supabase.from('transactions').update({
          amount: txs[idx].amount,
          category: txs[idx].category,
          priority_tag: txs[idx].priority_tag,
          transaction_type: txs[idx].transaction_type,
          date: txs[idx].date,
          description: txs[idx].description
        }).eq('trans_id', transId).then(({ error }) => {
          if (error) console.error('Supabase transaction update error:', error);
        });
        
        return txs[idx];
      }
      return null;
    }
  },
  budgets: {
    get: (userId) => {
      const budgets = JSON.parse(localStorage.getItem('mizan_budgets') || '[]').map(b => decrypt(b));
      return budgets.find(b => b.user_id === userId) || null;
    },
    save: (userId, data) => {
      const budgets = JSON.parse(localStorage.getItem('mizan_budgets') || '[]').map(b => decrypt(b));
      const idx = budgets.findIndex(b => b.user_id === userId);
      const updated = {
        plan_id: idx !== -1 ? budgets[idx].plan_id : generateUUID(),
        user_id: userId,
        monthly_budget: parseFloat(data.monthly_budget),
        allocation_ratio: data.allocation_ratio || DEFAULT_BUDGET.allocation_ratio,
        limit_alert: parseFloat(data.limit_alert)
      };
      if (idx !== -1) {
        budgets[idx] = updated;
      } else {
        budgets.push(updated);
      }
      localStorage.setItem('mizan_budgets', JSON.stringify(budgets.map(b => encrypt(b))));
      db.logs.add(userId, 'Budget_Created');
      
      // Background sync to Supabase
      supabase.from('budgets').upsert({
        plan_id: updated.plan_id,
        user_id: updated.user_id,
        allocation_ratio: updated.allocation_ratio,
        limit_alert: updated.limit_alert,
        monthly_budget: updated.monthly_budget
      }).then(({ error }) => {
        if (error) console.error('Supabase budget upsert error:', error);
      });
      
      return updated;
    }
  },
  syariah: {
    get: (userId) => {
      const monitor = JSON.parse(localStorage.getItem('mizan_syariah') || '[]').map(s => decrypt(s));
      return monitor.find(s => s.user_id === userId) || null;
    },
    save: (userId, data) => {
      const monitor = JSON.parse(localStorage.getItem('mizan_syariah') || '[]').map(s => decrypt(s));
      const idx = monitor.findIndex(s => s.user_id === userId);
      const updated = {
        eval_id: idx !== -1 ? monitor[idx].eval_id : generateUUID(),
        user_id: userId,
        score_israf: data.score_israf,
        reminder_status: data.reminder_status,
        last_evaluated: new Date().toISOString()
      };
      if (idx !== -1) {
        monitor[idx] = updated;
      } else {
        monitor.push(updated);
      }
      localStorage.setItem('mizan_syariah', JSON.stringify(monitor.map(s => encrypt(s))));
      
      // Background sync to Supabase
      supabase.from('syariah_monitor').upsert({
        eval_id: updated.eval_id,
        user_id: updated.user_id,
        score_israf: updated.score_israf,
        reminder_status: updated.reminder_status,
        last_evaluated: updated.last_evaluated
      }).then(({ error }) => {
        if (error) console.error('Supabase syariah_monitor upsert error:', error);
      });
      
      return updated;
    }
  },
  worship: {
    get: (userId, date) => {
      const list = JSON.parse(localStorage.getItem('mizan_worship') || '[]').map(w => decrypt(w));
      return list.find(w => w.user_id === userId && w.date === date) || {
        user_id: userId,
        date,
        subuh: false,
        dzuhur: false,
        ashar: false,
        maghrib: false,
        isya: false,
        sunnah: false,
        tilawah: 0
      };
    },
    save: (userId, date, data) => {
      const list = JSON.parse(localStorage.getItem('mizan_worship') || '[]').map(w => decrypt(w));
      const idx = list.findIndex(w => w.user_id === userId && w.date === date);
      const updated = {
        user_id: userId,
        date,
        subuh: data.subuh || false,
        dzuhur: data.dzuhur || false,
        ashar: data.ashar || false,
        maghrib: data.maghrib || false,
        isya: data.isya || false,
        sunnah: data.sunnah || false,
        tilawah: parseInt(data.tilawah || 0)
      };
      if (idx !== -1) {
        list[idx] = updated;
      } else {
        list.push(updated);
      }
      localStorage.setItem('mizan_worship', JSON.stringify(list.map(w => encrypt(w))));
      
      // Background sync to Supabase
      supabase.from('worship_logs').upsert({
        user_id: userId,
        date,
        subuh: updated.subuh,
        dzuhur: updated.dzuhur,
        ashar: updated.ashar,
        maghrib: updated.maghrib,
        isya: updated.isya,
        sunnah: updated.sunnah,
        tilawah: updated.tilawah
      }).then(({ error }) => {
        if (error) console.error('Supabase worship upsert error:', error);
      });
      
      return updated;
    }
  },
  health: {
    get: (userId, date) => {
      const list = JSON.parse(localStorage.getItem('mizan_health') || '[]').map(h => decrypt(h));
      return list.find(h => h.user_id === userId && h.date === date) || {
        user_id: userId,
        date,
        water: 0,
        sleep_hours: 8,
        exercise: false,
        healthy_food: false,
        read_book: false,
        mood: '😐',
        steps: 0,
        meals: { breakfast: false, lunch: false, dinner: false }
      };
    },
    save: (userId, date, data) => {
      const list = JSON.parse(localStorage.getItem('mizan_health') || '[]').map(h => decrypt(h));
      const idx = list.findIndex(h => h.user_id === userId && h.date === date);
      const updated = {
        user_id: userId,
        date,
        water: parseInt(data.water || 0),
        sleep_hours: parseFloat(data.sleep_hours || 8),
        exercise: data.exercise || false,
        healthy_food: data.healthy_food || false,
        read_book: data.read_book || false,
        mood: data.mood || '😐',
        steps: parseInt(data.steps || 0),
        meals: data.meals || { breakfast: false, lunch: false, dinner: false }
      };
      if (idx !== -1) {
        list[idx] = updated;
      } else {
        list.push(updated);
      }
      localStorage.setItem('mizan_health', JSON.stringify(list.map(h => encrypt(h))));
      
      // Background sync to Supabase
      supabase.from('health_logs').upsert({
        user_id: userId,
        date,
        water: updated.water,
        sleep_hours: updated.sleep_hours,
        exercise: updated.exercise,
        healthy_food: updated.healthy_food,
        read_book: updated.read_book
      }).then(({ error }) => {
        if (error) console.error('Supabase health upsert error:', error);
      });
      
      return updated;
    }
  },
  targets: {
    list: (userId) => {
      const list = JSON.parse(localStorage.getItem('mizan_worship_targets') || '[]').map(t => decrypt(t));
      return list.filter(t => t.user_id === userId);
    },
    add: (userId, target) => {
      const list = JSON.parse(localStorage.getItem('mizan_worship_targets') || '[]').map(t => decrypt(t));
      const newTarget = {
        target_id: generateUUID(),
        user_id: userId,
        title: target.title,
        target_amount: parseFloat(target.target_amount),
        current_amount: parseFloat(target.current_amount || 0),
        deadline: target.deadline
      };
      list.push(newTarget);
      localStorage.setItem('mizan_worship_targets', JSON.stringify(list.map(t => encrypt(t))));
      
      // Background sync to Supabase
      supabase.from('worship_targets').insert({
        target_id: newTarget.target_id,
        user_id: newTarget.user_id,
        title: newTarget.title,
        target_amount: newTarget.target_amount,
        current_amount: newTarget.current_amount,
        deadline: newTarget.deadline
      }).then(({ error }) => {
        if (error) console.error('Supabase target insert error:', error);
      });
      
      return newTarget;
    },
    saveCurrentAmount: (targetId, amount) => {
      const list = JSON.parse(localStorage.getItem('mizan_worship_targets') || '[]').map(t => decrypt(t));
      const idx = list.findIndex(t => t.target_id === targetId);
      if (idx !== -1) {
        list[idx].current_amount = parseFloat(amount);
        localStorage.setItem('mizan_worship_targets', JSON.stringify(list.map(t => encrypt(t))));
        
        // Background sync to Supabase
        supabase.from('worship_targets').update({
          current_amount: list[idx].current_amount
        }).eq('target_id', targetId).then(({ error }) => {
          if (error) console.error('Supabase target update error:', error);
        });
        
        return list[idx];
      }
      return null;
    }
  },
  obligations: {
    list: (userId) => {
      const list = JSON.parse(localStorage.getItem('mizan_obligations') || '[]').map(o => decrypt(o));
      return list.filter(o => o.user_id === userId);
    },
    add: (userId, obligation) => {
      const list = JSON.parse(localStorage.getItem('mizan_obligations') || '[]').map(o => decrypt(o));
      const newObligation = {
        ob_id: generateUUID(),
        user_id: userId,
        title: obligation.title,
        amount: parseFloat(obligation.amount),
        paid: false
      };
      list.push(newObligation);
      localStorage.setItem('mizan_obligations', JSON.stringify(list.map(o => encrypt(o))));
      
      supabase.from('obligations').insert(newObligation).then(({ error }) => {
        if (error) console.error('Supabase obligation insert error:', error);
      });
      
      return newObligation;
    },
    update: (obId, data) => {
      const list = JSON.parse(localStorage.getItem('mizan_obligations') || '[]').map(o => decrypt(o));
      const idx = list.findIndex(o => o.ob_id === obId);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...data };
        localStorage.setItem('mizan_obligations', JSON.stringify(list.map(o => encrypt(o))));
        
        supabase.from('obligations').update({
          title: list[idx].title,
          amount: list[idx].amount,
          paid: list[idx].paid
        }).eq('ob_id', obId).then(({ error }) => {
          if (error) console.error('Supabase obligation update error:', error);
        });
        
        return list[idx];
      }
      return null;
    },
    delete: (obId) => {
      const list = JSON.parse(localStorage.getItem('mizan_obligations') || '[]').map(o => decrypt(o));
      const filtered = list.filter(o => o.ob_id !== obId);
      localStorage.setItem('mizan_obligations', JSON.stringify(filtered.map(o => encrypt(o))));
      
      supabase.from('obligations').delete().eq('ob_id', obId).then(({ error }) => {
        if (error) console.error('Supabase obligation delete error:', error);
      });
      return true;
    }
  },
  logs: {
    list: () => {
      return JSON.parse(localStorage.getItem('mizan_logs') || '[]').map(l => decrypt(l)).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    },
    add: (userId, actionType) => {
      const logs = JSON.parse(localStorage.getItem('mizan_logs') || '[]').map(l => decrypt(l));
      const newLog = {
        log_id: generateUUID(),
        user_id: userId,
        action_type: actionType,
        device_info: { os: 'Browser', brand: 'Webapp', model: navigator.userAgent.substring(0, 30) + '...' },
        ip_address: '127.0.0.1 (localhost)',
        timestamp: new Date().toISOString()
      };
      logs.push(newLog);
      localStorage.setItem('mizan_logs', JSON.stringify(logs.map(l => encrypt(l))));
      
      // Background sync to Supabase
      supabase.from('activity_logs').insert({
        log_id: newLog.log_id,
        user_id: newLog.user_id,
        action_type: newLog.action_type,
        device_info: newLog.device_info,
        ip_address: newLog.ip_address,
        timestamp: newLog.timestamp
      }).then(({ error }) => {
        if (error) console.error('Supabase activity_logs insert error:', error);
      });
      
      return newLog;
    }
  },
  auth: {
    login: (email, password) => {
      const users = JSON.parse(localStorage.getItem('mizan_users') || '[]').map(u => decrypt(u));
      const user = users.find(u => u.email === email.toLowerCase() && u.password === password);
      if (user) {
        db.logs.add(user.user_id, 'User_Login');
        return user;
      }
      return null;
    },
    register: (name, email, password) => {
      const users = JSON.parse(localStorage.getItem('mizan_users') || '[]').map(u => decrypt(u));
      const exists = users.some(u => u.email === email.toLowerCase());
      if (exists) {
        return { error: 'Email sudah terdaftar!' };
      }
      const newUser = {
        user_id: generateUUID(),
        username: name,
        email: email.toLowerCase(),
        password,
        profiling_data: {
          campus: 'Universitas Indonesia',
          semester: 1,
          major: 'Belum Diatur',
          monthly_allowance: 2000000
        },
        created_at: new Date().toISOString()
      };
      users.push(newUser);
      localStorage.setItem('mizan_users', JSON.stringify(users.map(u => encrypt(u))));
      
      // Initialize default budget
      const newBudget = {
        plan_id: generateUUID(),
        user_id: newUser.user_id,
        allocation_ratio: { dharuriyat: 50, hajiyat: 20, tahsiniyat: 10, saving: 20 },
        limit_alert: 600000,
        monthly_budget: 2000000
      };
      const budgets = JSON.parse(localStorage.getItem('mizan_budgets') || '[]').map(b => decrypt(b));
      budgets.push(newBudget);
      localStorage.setItem('mizan_budgets', JSON.stringify(budgets.map(b => encrypt(b))));
      
      // Background sync to Supabase
      supabase.from('users').insert(newUser).then(() => {
        supabase.from('budgets').insert(newBudget);
      }).catch(err => console.error('Supabase registration sync error:', err));

      db.logs.add(newUser.user_id, 'User_Registration');
      return newUser;
    }
  }
};
