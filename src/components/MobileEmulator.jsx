import { useState, useEffect, useRef, useCallback } from 'react';
import { db, secureRandom } from '../services/db';
import {
  classifyTransaction,
  calculateFinancials,
  detectIsraf,
  predictBalanceDepletion,
  calculateMizanScore,
  CATEGORY_TO_SYARIAH_MAP
} from '../services/ai';

const PRAYER_SCHEDULES = {
  Jakarta: { subuh: '04:45', dzuhur: '12:00', ashar: '15:15', maghrib: '17:55', isya: '19:10' },
  Surabaya: { subuh: '04:30', dzuhur: '11:45', ashar: '15:00', maghrib: '17:40', isya: '18:55' },
  Bandung: { subuh: '04:46', dzuhur: '12:01', ashar: '15:16', maghrib: '17:56', isya: '19:11' },
  Yogyakarta: { subuh: '04:38', dzuhur: '11:53', ashar: '15:08', maghrib: '17:48', isya: '19:03' },
  Medan: { subuh: '05:05', dzuhur: '12:30', ashar: '15:55', maghrib: '18:35', isya: '19:50' },
  Makassar: { subuh: '04:55', dzuhur: '12:10', ashar: '15:25', maghrib: '18:05', isya: '19:20' }
};

const HADITS_QUOTES = [
  { text: "Tangan yang di atas lebih baik daripada tangan yang di bawah.", source: "HR. Bukhari & Muslim" },
  { text: "Kekayaan (yang hakiki) bukanlah dengan banyaknya harta, namun kekayaan adalah hati yang selalu merasa cukup.", source: "HR. Bukhari & Muslim" },
  { text: "Bekerjalah untuk duniamu seolah-olah kamu akan hidup selamanya; dan bekerjalah untuk akhiratmu seolah-olah kamu akan mati besok.", source: "Ungkapan Hikmah" },
  { text: "Sesungguhnya Allah menyukai jika salah seorang di antara kalian melakukan suatu pekerjaan, ia melakukannya dengan itqan (profesional/bersugguh-sungguh).", source: "HR. Al-Baihaqi" },
  { text: "Tidaklah seseorang makan makanan yang lebih baik daripada makan dari hasil usahanya sendiri.", source: "HR. Bukhari" }
];



export default function MobileEmulator({ onActionLogged }) {
  // Authentication states
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('mizan_session');
    return saved ? JSON.parse(saved) : null;
  });
  const [authMode, setAuthMode] = useState('login'); // login | register
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });

  // Navigation states
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard | finance | islamic | health
  const [financeSubTab, setFinanceSubTab] = useState('pencatatan'); // pencatatan | jurnal | laporan

  // Mobile viewport detection
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Core application data
  const [transactions, setTransactions] = useState([]);
  const [budgetPlan, setBudgetPlan] = useState(null);
  const [mizanScoreData, setMizanScoreData] = useState({ score: 100, financial: 100, worship: 100, health: 100, recommendations: [] });
  const [forecast, setForecast] = useState({ days_until_empty: 999, depletion_date: '', avg_daily_expense: 0, current_balance: 0 });
  const [targets, setTargets] = useState([]);
  const [obligations, setObligations] = useState([]);
  
  // Custom features
  const [emergencyFund, setEmergencyFund] = useState(0); // Saldo Aman / Dana Cadangan
  const [city, setCity] = useState('Jakarta');
  const [time, setTime] = useState(new Date());
  const [prayerReminderMin, setPrayerReminderMin] = useState(10); // minutes before
  
  // Trackers
  const [worshipTracker, setWorshipTracker] = useState({ subuh: false, dzuhur: false, ashar: false, maghrib: false, isya: false, sunnah: false, tilawah: 0 });
  const [healthTracker, setHealthTracker] = useState({ water: 0, sleep_hours: '', exercise: false, healthy_food: false, read_book: false, mood: '😐', steps: 0, meals: { breakfast: false, lunch: false, dinner: false }, weekly_workouts: 0 });

  // Tasbih States
  const [tasbihCount, setTasbihCount] = useState(0);
  const [tasbihPhrases] = useState(['Subhanallah', 'Alhamdulillah', 'Allahu Akbar']);
  const [activePhraseIndex, setActivePhraseIndex] = useState(0);

  // Chat AI States
  const [chatMessages, setChatMessages] = useState([
    { id: 'msg-init', sender: 'bot', text: 'Assalamu\'alaikum! Saya Mizan AI. Tanyakan apa saja mengenai kondisi finansial, sisa saldo, prediksi israf, kewajiban bulanan, target wishlist impian, atau kondisi kesehatan Anda hari ini.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  // Movement Inspirations State
  const [inspirationText, setInspirationText] = useState('');
  const MOVEMENT_INSPIRATIONS = [
    "Lagi bosan joging? Yuk coba stretching 15 menit aja biar badan seger!",
    "Coba jalan santai keliling komplek sambil dengerin murattal atau podcast islami!",
    "Lakukan push-up 10 kali dan squat 10 kali sebelum mandi sore!",
    "Yoga/stretching ringan sebelum tidur malam biar tidur lebih lelap!",
    "Yuk coba workout 15 menit dengan panduan video olahraga di rumah!",
    "Bersepeda santai sore hari selama 20 menit untuk menyegarkan pikiran!"
  ];

  // Random Daily Hadith
  const [haditsIndex] = useState(() => Math.floor(secureRandom() * HADITS_QUOTES.length));

  // Transaction Edit states
  const [isEditing, setIsEditing] = useState(false);
  const [editingTxId, setEditingTxId] = useState(null);

  // Input Forms
  const [txForm, setTxForm] = useState({
    amount: '',
    category: 'makan_utama',
    transaction_type: 'Keluar',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });



  const [newTargetForm, setNewTargetForm] = useState({ title: '', target_amount: '', deadline: '' });
  const [targetAddAmounts, setTargetAddAmounts] = useState({});

  // Monthly Obligations Form
  const [newObForm, setNewObForm] = useState({ title: '', amount: '' });

  // Feedback toast
  const [toast, setToast] = useState(null);
  const [hoveredExpenseIdx, setHoveredExpenseIdx] = useState(null);
  // Helper calculation for next prayer
  const getNextPrayerInfo = () => {
    const schedule = PRAYER_SCHEDULES[city] || PRAYER_SCHEDULES.Jakarta;
    const nowHours = time.getHours();
    const nowMinutes = time.getMinutes();
    const nowSeconds = time.getSeconds();
    const nowTotalSec = nowHours * 3600 + nowMinutes * 60 + nowSeconds;

    const parseSec = (timeStr) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 3600 + m * 60;
    };

    const prayers = [
      { name: 'Subuh', time: schedule.subuh, seconds: parseSec(schedule.subuh) },
      { name: 'Dzuhur', time: schedule.dzuhur, seconds: parseSec(schedule.dzuhur) },
      { name: 'Ashar', time: schedule.ashar, seconds: parseSec(schedule.ashar) },
      { name: 'Maghrib', time: schedule.maghrib, seconds: parseSec(schedule.maghrib) },
      { name: 'Isya', time: schedule.isya, seconds: parseSec(schedule.isya) }
    ];

    let next = null;
    for (let p of prayers) {
      if (p.seconds > nowTotalSec) {
        next = p;
        break;
      }
    }

    if (!next) {
      next = { ...prayers[0], isTomorrow: true };
    }

    const diffSec = next.isTomorrow
      ? (24 * 3600 - nowTotalSec) + next.seconds
      : next.seconds - nowTotalSec;

    const h = Math.floor(diffSec / 3600);
    const m = Math.floor((diffSec % 3600) / 60);
    const s = diffSec % 60;
    const countdown = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    return {
      nextPrayerName: next.name,
      nextPrayerTime: next.time,
      countdown,
      diffMinutes: Math.floor(diffSec / 60)
    };
  };

  const loadData = useCallback(() => {
    if (!currentUser) return;
    const userId = currentUser.user_id;
    const txList = db.transactions.list(userId);
    const budget = db.budgets.get(userId);
    const targetList = db.targets.list(userId);
    const obList = db.obligations.list(userId);
    
    // Fetch trackers for today
    const todayStr = new Date().toISOString().split('T')[0];
    const wLog = db.worship.get(userId, todayStr);
    const hLog = db.health.get(userId, todayStr);

    // AI and Mizan Scores
    const mizanScores = calculateMizanScore(userId);
    
    // Adjust Health Score locally based on mood harian
    let adjustedHealth = mizanScores.health;
    if (hLog.mood === '😴' || hLog.mood === '😰' || hLog.mood === '🤒') {
      adjustedHealth = Math.max(0, adjustedHealth - 5);
    } else if (hLog.mood === '😊' || hLog.mood === '💪' || hLog.mood === '🤲') {
      adjustedHealth = Math.min(100, adjustedHealth + 5);
    }

    const finalMizanScore = Math.round((0.40 * mizanScores.financial) + (0.30 * mizanScores.worship) + (0.30 * adjustedHealth));

    const forecastData = predictBalanceDepletion(userId);

    // Defer state updates to avoid synchronous cascading renders inside useEffect
    setTimeout(() => {
      setTransactions(txList);
      setBudgetPlan(budget);
      setTargets(targetList);
      setObligations(obList);
      setWorshipTracker(wLog);
      setHealthTracker(hLog);
      setMizanScoreData({
        ...mizanScores,
        health: adjustedHealth,
        score: finalMizanScore
      });
      setForecast(forecastData);
    }, 0);
  }, [currentUser]);

  // Screen resize handler for mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize data on user changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time clock and countdown reminder ticker
  useEffect(() => {
    const clock = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(clock);
  }, []);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);



  // Tasbih Handlers
  const incrementTasbih = () => {
    setTasbihCount(prev => {
      const next = prev + 1;
      if (next % 33 === 0) {
        setActivePhraseIndex(idx => (idx + 1) % tasbihPhrases.length);
        showToast('success', `Maa syaa Allah, 33x ${tasbihPhrases[activePhraseIndex]} selesai!`);
      }
      return next;
    });
  };

  const resetTasbih = () => {
    setTasbihCount(0);
    setActivePhraseIndex(0);
  };

  // Auth Handlers
  const handleAuthSubmit = (e) => {
    e.preventDefault();
    if (authMode === 'login') {
      const user = db.auth.login(authForm.email, authForm.password);
      if (user) {
        setCurrentUser(user);
        localStorage.setItem('mizan_session', JSON.stringify(user));
        showToast('success', `Assalamu'alaikum, ${user.username}!`);
        if (onActionLogged) onActionLogged();
      } else {
        showToast('error', 'Email atau password salah!');
      }
    } else {
      if (!authForm.name || !authForm.email || !authForm.password) {
        showToast('error', 'Mohon lengkapi semua bidang!');
        return;
      }
      const res = db.auth.register(authForm.name, authForm.email, authForm.password);
      if (res.error) {
        showToast('error', res.error);
      } else {
        setCurrentUser(res);
        localStorage.setItem('mizan_session', JSON.stringify(res));
        showToast('success', `Registrasi sukses! Selamat datang, ${res.username}!`);
        if (onActionLogged) onActionLogged();
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('mizan_session');
    setCurrentUser(null);
    setActiveTab('dashboard');
    setIsEditing(false);
    setEditingTxId(null);
    setChatMessages([
      { id: 'msg-init', sender: 'bot', text: 'Assalamu\'alaikum! Saya Mizan AI. Tanyakan apa saja mengenai kondisi finansial, sisa saldo, prediksi israf, kewajiban bulanan, target wishlist impian, atau kondisi kesehatan Anda hari ini.' }
    ]);
    showToast('success', 'Anda telah keluar.');
    if (onActionLogged) onActionLogged();
  };

  // Transaction Handlers
  const handleAddTransaction = (e) => {
    e.preventDefault();
    if (!txForm.amount || parseFloat(txForm.amount) <= 0) {
      showToast('error', 'Mohon isi nominal yang valid!');
      return;
    }

    const { priority_tag } = classifyTransaction(txForm.category);
    const userId = currentUser.user_id;

    // Detect Israf (only for expenses)
    if (txForm.transaction_type === 'Keluar' && priority_tag === 'Tahsiniyat') {
      const israfCheck = detectIsraf(userId, txForm.amount, txForm.category);
      if (israfCheck.israf) {
        db.logs.add(userId, 'Israf_Warning');
        if (onActionLogged) onActionLogged();
        showToast('warning', israfCheck.message);
      }
    }

    // Auto mark obligation paid if matches
    let obligationResolvedText = "";
    if (txForm.transaction_type === 'Keluar') {
      const desc = txForm.description.toLowerCase();
      const matchingOb = obligations.find(o => !o.paid && (desc.includes(o.title.toLowerCase()) || o.title.toLowerCase().includes(desc)));
      if (matchingOb) {
        db.obligations.update(matchingOb.ob_id, { paid: true });
        obligationResolvedText = ` (Kewajiban bulanan "${matchingOb.title}" ditandai lunas secara otomatis!)`;
      }
    }

    if (isEditing && editingTxId) {
      db.transactions.update(editingTxId, {
        amount: txForm.amount,
        category: txForm.category,
        transaction_type: txForm.transaction_type,
        priority_tag: txForm.transaction_type === 'Masuk' ? 'Dharuriyat' : priority_tag,
        description: txForm.description || (txForm.transaction_type === 'Masuk' ? 'Pemasukan' : classifyTransaction(txForm.category).label),
        date: txForm.date
      });
      db.logs.add(userId, 'Transaction_Updated');
      showToast('success', `Transaksi berhasil diperbarui!${obligationResolvedText}`);
    } else {
      db.transactions.add(userId, {
        amount: txForm.amount,
        category: txForm.category,
        transaction_type: txForm.transaction_type,
        priority_tag: txForm.transaction_type === 'Masuk' ? 'Dharuriyat' : priority_tag,
        description: txForm.description || (txForm.transaction_type === 'Masuk' ? 'Pemasukan' : classifyTransaction(txForm.category).label),
        date: txForm.date
      });
      db.logs.add(userId, 'Transaction_Added');
      showToast('success', `Transaksi berhasil disimpan!${obligationResolvedText}`);
    }

    if (onActionLogged) onActionLogged();

    // Reset Form
    setTxForm({
      amount: '',
      category: 'makan_utama',
      transaction_type: 'Keluar',
      description: '',
      date: new Date().toISOString().split('T')[0]
    });
    setIsEditing(false);
    setEditingTxId(null);

    loadData();
  };

  const handleEditTxClick = (tx) => {
    setIsEditing(true);
    setEditingTxId(tx.trans_id);
    setTxForm({
      amount: tx.amount.toString(),
      category: tx.category,
      transaction_type: tx.transaction_type,
      description: tx.description,
      date: tx.date
    });
    setActiveTab('finance');
    setFinanceSubTab('pencatatan');
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditingTxId(null);
    setTxForm({
      amount: '',
      category: 'makan_utama',
      transaction_type: 'Keluar',
      description: '',
      date: new Date().toISOString().split('T')[0]
    });
  };

  const handleDeleteTx = (id) => {
    if (window.confirm('Hapus transaksi ini?')) {
      db.transactions.delete(id);
      db.logs.add(currentUser.user_id, 'Transaction_Deleted');
      if (onActionLogged) onActionLogged();
      
      if (editingTxId === id) {
        cancelEdit();
      }
      
      loadData();
      showToast('success', 'Transaksi dihapus.');
    }
  };

  const handleDownloadReport = () => {
    const today = new Date();
    const dateString = today.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    
    const savingsPercent = finReportData.totalRevenues > 0 
      ? ((finReportData.totalRevenues - finReportData.totalExpenses) / finReportData.totalRevenues) * 100 
      : 0;

    let csvContent = "sep=,\n"; // Paksa Excel menggunakan pemisah koma
    csvContent += "LAPORAN KEUANGAN PRIBADI MIZAN\n";
    csvContent += `Tanggal Laporan,${dateString}\n`;
    csvContent += `Pengguna,${currentUser.username}\n\n`;

    csvContent += "1. RINGKASAN ARUS KAS BULAN INI\n";
    csvContent += "Keterangan,Nominal (Rupiah)\n";
    csvContent += `Total Pemasukan,${finReportData.totalRevenues}\n`;
    csvContent += `Total Pengeluaran,-${finReportData.totalExpenses}\n`;
    csvContent += `Surplus / Sisa Uang,${finReportData.netProfit}\n`;
    csvContent += `Savings Rate,${savingsPercent.toFixed(1)}%\n\n`;

    csvContent += "2. TREN KEUANGAN 3 BULAN TERAKHIR\n";
    csvContent += "Bulan,Pemasukan,Pengeluaran,Surplus\n";
    const trendData = getCalendarMonthsAccumulation();
    trendData.forEach(m => {
      const surplus = m.income - m.expense;
      csvContent += `${m.monthLabel},${m.income},${m.expense},${surplus}\n`;
    });
    csvContent += "\n";

    csvContent += "3. DETAIL PENGELUARAN POS SYARIAH\n";
    csvContent += "Kategori Pengeluaran,Nominal (Rupiah),Persentase,Prioritas Syariah\n";
    const categoryItems = Object.entries(finReportData.expenses).map(([key, val]) => ({
      key,
      value: val,
      label: CATEGORY_TO_SYARIAH_MAP[key]?.label || key,
      pct: (val / (finReportData.totalExpenses || 1)) * 100
    })).sort((a, b) => b.value - a.value);

    categoryItems.forEach(cat => {
      csvContent += `"${cat.label}",${cat.value},${cat.pct.toFixed(1)}%,${classifyTransaction(cat.key).priority_tag}\n`;
    });
    csvContent += "\n";

    csvContent += "4. PROGRESS GOL KEUANGAN (WISHLIST IMPIAN)\n";
    csvContent += "Wishlist Impian,Terkumpul,Target Nominal,Persentase,Deadline,Status Rekomendasi\n";
    if (targets.length === 0) {
      csvContent += "Belum ada wishlist impian aktif.,,,,\n";
    } else {
      targets.forEach(tg => {
        const percent = Math.min(100, Math.round((tg.current_amount / tg.target_amount) * 100));
        const advice = getWishlistAdvice(tg);
        csvContent += `"${tg.title.replace(/"/g, '""')}",${tg.current_amount},${tg.target_amount},${percent}%,${tg.deadline},"${advice.advice.replace(/"/g, '""')}"\n`;
      });
    }
    csvContent += "\n";

    csvContent += "5. EVALUASI DAN REKOMENDASI AI MIZAN\n";
    let evaluation = "";
    if (finReportData.totalRevenues === 0) {
      evaluation += "Belum ada pemasukan yang tercatat bulan ini. ";
    } else {
      if (savingsPercent >= 20) {
        evaluation += `Tingkat tabungan Anda sangat baik: ${savingsPercent.toFixed(1)}% (Target ideal >= 20%). `;
      } else {
        evaluation += `Tingkat tabungan Anda cukup rendah: ${savingsPercent.toFixed(1)}% (Di bawah target ideal 20%). `;
      }
    }
    
    let tahsiniyatTotal = 0;
    Object.entries(finReportData.expenses).forEach(([key, val]) => {
      const mapping = classifyTransaction(key);
      if (mapping.priority_tag === 'Tahsiniyat') {
        tahsiniyatTotal += val;
      }
    });
    if (finReportData.totalExpenses > 0) {
      const tahsiniyatRatio = (tahsiniyatTotal / finReportData.totalExpenses) * 100;
      if (tahsiniyatRatio > 40) {
        evaluation += `Peringatan Israf: Pengeluaran Gaya Hidup (Tahsiniyat) mencapai ${tahsiniyatRatio.toFixed(1)}%. `;
      } else {
        evaluation += `Pola hidup sehat! Pengeluaran gaya hidup Anda (${tahsiniyatRatio.toFixed(1)}%) terkontrol di bawah 40%. `;
      }
    }
    csvContent += `Kesimpulan AI Mizan,"${evaluation.trim()}"\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Laporan_Keuangan_Mizan_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('success', 'Laporan keuangan berhasil diunduh dalam format Excel (CSV)!');
  };

  // Obligations Handlers
  const handleAddObligation = (e) => {
    e.preventDefault();
    if (!newObForm.title || !newObForm.amount) {
      showToast('error', 'Mohon lengkapi formulir kewajiban!');
      return;
    }
    db.obligations.add(currentUser.user_id, {
      title: newObForm.title,
      amount: newObForm.amount
    });
    setNewObForm({ title: '', amount: '' });
    loadData();
    showToast('success', 'Kewajiban bulanan berhasil ditambahkan!');
  };

  const handleDeleteObligation = (id) => {
    if (window.confirm('Hapus kewajiban bulanan ini?')) {
      db.obligations.delete(id);
      loadData();
      showToast('success', 'Kewajiban bulanan dihapus.');
    }
  };

  const toggleObligationPaid = (id) => {
    const ob = obligations.find(o => o.ob_id === id);
    if (!ob) return;
    const newPaid = !ob.paid;
    db.obligations.update(id, { paid: newPaid });

    // Automatically record outflow transaction when marking as paid
    if (newPaid) {
      db.transactions.add(currentUser.user_id, {
        amount: ob.amount,
        category: 'bayar_kos',
        transaction_type: 'Keluar',
        priority_tag: 'Dharuriyat',
        description: `Pembayaran: ${ob.title}`,
        date: new Date().toISOString().split('T')[0]
      });
      showToast('success', `Kewajiban "${ob.title}" ditandai lunas dan transaksi dicatat!`);
    } else {
      showToast('success', `Kewajiban "${ob.title}" ditandai belum dibayar.`);
    }

    loadData();
    if (onActionLogged) onActionLogged();
  };



  // Worship & Health Trackers Save
  const toggleWorship = (key) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const updated = { ...worshipTracker, [key]: !worshipTracker[key] };
    db.worship.save(currentUser.user_id, todayStr, updated);
    setWorshipTracker(updated);
    
    loadData();
    if (onActionLogged) onActionLogged();
  };

  const incrementTilawah = (amount) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const newPage = Math.max(0, worshipTracker.tilawah + amount);
    const updated = { ...worshipTracker, tilawah: newPage };
    db.worship.save(currentUser.user_id, todayStr, updated);
    setWorshipTracker(updated);
    
    loadData();
    if (onActionLogged) onActionLogged();
  };

  // Health Tracker Setters (Extended)
  const setWaterGlasses = (glasses) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const updated = { ...healthTracker, water: glasses };
    db.health.save(currentUser.user_id, todayStr, updated);
    setHealthTracker(updated);
    
    loadData();
    if (onActionLogged) onActionLogged();
  };

  const toggleHealthHabit = (key) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const updated = { ...healthTracker, [key]: !healthTracker[key] };
    db.health.save(currentUser.user_id, todayStr, updated);
    setHealthTracker(updated);
    
    loadData();
    if (onActionLogged) onActionLogged();
  };

  const handleSleepChange = (hours) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const updated = { ...healthTracker, sleep_hours: parseFloat(hours || 0) };
    db.health.save(currentUser.user_id, todayStr, updated);
    setHealthTracker(updated);
    
    loadData();
    if (onActionLogged) onActionLogged();
  };

  const handleMoodSelect = (moodEmoji) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const updated = { ...healthTracker, mood: moodEmoji };
    db.health.save(currentUser.user_id, todayStr, updated);
    setHealthTracker(updated);
    
    loadData();
    if (onActionLogged) onActionLogged();
  };

  const toggleMealTrack = (mealKey) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const newMeals = { ...healthTracker.meals, [mealKey]: !healthTracker.meals?.[mealKey] };
    const updated = { ...healthTracker, meals: newMeals };
    db.health.save(currentUser.user_id, todayStr, updated);
    setHealthTracker(updated);
    
    loadData();
    if (onActionLogged) onActionLogged();
  };

  const handleWeeklyWorkoutToggle = (num) => {
    const todayStr = new Date().toISOString().split('T')[0];
    let newVal = num;
    if (healthTracker.weekly_workouts === num) {
      newVal = num - 1;
    }
    const updated = { ...healthTracker, weekly_workouts: newVal };
    db.health.save(currentUser.user_id, todayStr, updated);
    setHealthTracker(updated);
    
    loadData();
    if (onActionLogged) onActionLogged();
  };

  const showRandomInspiration = () => {
    const idx = Math.floor(secureRandom() * MOVEMENT_INSPIRATIONS.length);
    setInspirationText(MOVEMENT_INSPIRATIONS[idx]);
  };

  // Wishlist / Targets Handlers
  const handleAddWishlistTarget = (e) => {
    e.preventDefault();
    if (!newTargetForm.title || !newTargetForm.target_amount) {
      showToast('error', 'Lengkapi kolom wishlist!');
      return;
    }
    db.targets.add(currentUser.user_id, {
      title: newTargetForm.title,
      target_amount: newTargetForm.target_amount,
      deadline: newTargetForm.deadline || new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0]
    });
    setNewTargetForm({ title: '', target_amount: '', deadline: '' });
    loadData();
    showToast('success', 'Wishlist impian berhasil dibuat!');
  };

  const handleAddFundToTarget = (targetId, title) => {
    const amount = parseFloat(targetAddAmounts[targetId] || 0);
    if (amount <= 0) {
      showToast('error', 'Masukkan nominal dana!');
      return;
    }

    const { currentBalance } = calculateFinancials(currentUser.user_id, transactions, budgetPlan);
    if (amount > currentBalance) {
      showToast('error', 'Saldo tidak mencukupi!');
      return;
    }

    const target = targets.find(t => t.target_id === targetId);
    const newAmount = target.current_amount + amount;
    db.targets.saveCurrentAmount(targetId, newAmount);

    db.transactions.add(currentUser.user_id, {
      amount,
      category: 'sedekah_zakat',
      transaction_type: 'Keluar',
      priority_tag: 'Hajiyat',
      description: `Tabungan Impian: ${title}`,
      date: new Date().toISOString().split('T')[0]
    });

    setTargetAddAmounts({ ...targetAddAmounts, [targetId]: '' });
    loadData();
    showToast('success', `Berhasil menyetor ${formatRupiah(amount)} ke wishlist ${title}!`);
    if (onActionLogged) onActionLogged();
  };

  // Chat AI Handler
  const handleSendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput.trim();
    setChatMessages(prev => [...prev, { id: `msg-${Date.now()}-${secureRandom()}`, sender: 'user', text: userMsg }]);
    setChatInput('');
    setIsTyping(true);

    setTimeout(() => {
      const msg = userMsg.toLowerCase();
      let botResponse = "";

      const totalObs = obligations.reduce((sum, o) => sum + o.amount, 0);
      const freeBalance = Math.max(0, finReport.cash - emergencyFund);

      if (msg.includes('saldo') || msg.includes('uang') || msg.includes('cash') || msg.includes('sisa') || msg.includes('bebas')) {
        botResponse = `Sisa saldo bebas digunakan Anda saat ini adalah **${formatRupiah(freeBalance)}** (Total Saldo Asli: ${formatRupiah(finReport.cash)}, Dana Cadangan yang dikunci: ${formatRupiah(emergencyFund)}). Sisa saldo bebas ini diproyeksikan bertahan selama **${forecast.days_until_empty} hari** dengan pengeluaran harian rata-rata **${formatRupiah(forecast.avg_daily_expense)}**.`;
      } else if (msg.includes('boros') || msg.includes('israf') || msg.includes('hemat') || msg.includes('rekomendasi')) {
        botResponse = `Analisis Mizan AI menunjukkan Skor Keseimbangan Anda saat ini adalah **${mizanScoreData.score}/100**. `;
        if (mizanScoreData.score >= 80) {
          botResponse += "Kondisi Anda berada dalam status **SEIMBANG**. Terus pertahankan kedisiplinan berbelanja dan rutinitas rohani Anda.";
        } else {
          botResponse += "Status Anda **PERLU PENYELARASAN**. " + mizanScoreData.recommendations.map(r => r.message).join(" ");
        }
      } else if (msg.includes('laptop') || msg.includes('sepeda') || msg.includes('wishlist') || msg.includes('target') || msg.includes('beli') || msg.includes('tabung')) {
        if (targets.length > 0) {
          botResponse = "Analisis target wishlist impian Anda:\n";
          targets.forEach(tg => {
            const advice = getWishlistAdvice(tg);
            botResponse += `• **${tg.title}** (Target: ${formatRupiah(tg.target_amount)}): ${advice.advice}\n`;
          });
        } else {
          botResponse = "Anda belum mendaftarkan wishlist impian saat ini. Anda dapat menambahkannya di tab Keuangan ➔ Target Wishlist.";
        }
      } else if (msg.includes('kewajiban') || msg.includes('bayar') || msg.includes('tagihan') || msg.includes('kos') || msg.includes('spp')) {
        const unpaidList = obligations.filter(o => !o.paid);
        if (obligations.length > 0) {
          botResponse = `Total kewajiban bulanan Anda terdaftar adalah **${formatRupiah(totalObs)}**. `;
          if (unpaidList.length > 0) {
            botResponse += `Anda masih memiliki **${unpaidList.length} kewajiban belum dibayar** senilai **${formatRupiah(unpaidList.reduce((sum, o) => sum + o.amount, 0))}** (termasuk: ${unpaidList.map(o => o.title).join(", ")}).`;
          } else {
            botResponse += "MasyaAllah! Seluruh kewajiban bulanan utama Anda bulan ini telah terlunasi secara penuh.";
          }
        } else {
          botResponse = "Anda belum mendaftarkan kewajiban bulanan utama. Disarankan menambahkan pengeluaran tetap bulanan Anda di tab Keuangan agar sisa dana jajan lebih terpantau.";
        }
      } else if (msg.includes('ibadah') || msg.includes('shalat') || msg.includes('solat') || msg.includes('ngaji') || msg.includes('quran')) {
        botResponse = `Skor Ibadah Anda saat ini adalah **${mizanScoreData.worship}/100**. Hari ini Anda mencatat **${activeWorshipCount}/5 shalat wajib**. `;
        if (worshipTracker.tilawah > 0) {
          botResponse += `Maa syaa Allah, Anda juga telah bertilawah sebanyak **${worshipTracker.tilawah} lembar** hari ini. Semoga berkah!`;
        } else {
          botResponse += "Cobalah untuk merutinkan tilawah Al-Quran minimal 1 lembar setelah shalat wajib untuk menjaga ketenangan hati.";
        }
      } else if (msg.includes('sehat') || msg.includes('tidur') || msg.includes('minum') || msg.includes('mood') || msg.includes('langkah') || msg.includes('olahraga')) {
        botResponse = `Skor Kesehatan Anda adalah **${mizanScoreData.health}/100**. Log harian: Air minum **${healthTracker.water}/8 gelas**, tidur semalam **${healthTracker.sleep_hours} jam**, langkah kaki **${healthTracker.steps} langkah**, dengan mood **${healthTracker.mood}**. `;
        if (healthTracker.sleep_hours < 7) {
          botResponse += "Peringatan: Istirahat Anda kurang dari 7 jam. Silakan kurangi begadang malam ini.";
        } else {
          botResponse += "Istirahat dan asupan air Anda terpantau seimbang.";
        }
      } else {
        botResponse = "Halo! Saya Mizan AI. Anda bisa bertanya tentang: \n" +
          "1. *'Sisa saldo bebas'* atau *'kapan saldo habis'*\n" +
          "2. *'Apakah saya boros?'* atau *'analisis israf'*\n" +
          "3. *'Target wishlist'* untuk membeli sesuatu\n" +
          "4. *'Daftar kewajiban bulanan'*\n" +
          "5. *'Skor ibadah dan kesehatan harian'*\n\nAda yang ingin Anda tanyakan?";
      }

      setChatMessages(prev => [...prev, { id: `msg-${Date.now()}-${secureRandom()}`, sender: 'bot', text: botResponse }]);
      setIsTyping(false);
    }, 800);
  };

  // Double-Entry Accounting Mappings
  const getGeneralJournal = () => {
    const INCOME_LABELS = {
      gaji: 'Gaji',
      uang_saku: 'Uang Saku',
      freelance: 'Freelance',
      hadiah: 'Hadiah',
      bonus: 'Bonus',
      beasiswa: 'Beasiswa',
      investasi: 'Investasi',
      penjualan_barang: 'Penjualan Barang',
      lainnya: 'Lain-lain'
    };

    const journal = [];
    transactions.forEach((t) => {
      const mapping = classifyTransaction(t.category);
      if (t.transaction_type === 'Masuk') {
        journal.push({
          date: t.date,
          id: `${t.trans_id}-d`,
          type: 'debit',
          account: 'Kas',
          debit: t.amount,
          credit: 0,
          desc: t.description
        });
        journal.push({
          date: t.date,
          id: `${t.trans_id}-c`,
          type: 'credit',
          account: `Pendapatan - ${INCOME_LABELS[t.category] || t.category.toUpperCase().replace('_', ' ')}`,
          debit: 0,
          credit: t.amount,
          desc: t.description
        });
      } else {
        journal.push({
          date: t.date,
          id: `${t.trans_id}-d`,
          type: 'debit',
          account: `Beban - ${mapping.label}`,
          debit: t.amount,
          credit: 0,
          desc: t.description
        });
        journal.push({
          date: t.date,
          id: `${t.trans_id}-c`,
          type: 'credit',
          account: 'Kas',
          debit: 0,
          credit: t.amount,
          desc: t.description
        });
      }
    });
    return journal;
  };

  const getAccountingReports = () => {
    let cashBalance = 0;
    const revenues = {};
    const expenses = {};

    transactions.forEach(t => {
      if (t.transaction_type === 'Masuk') {
        cashBalance += t.amount;
        revenues[t.category] = (revenues[t.category] || 0) + t.amount;
      } else {
        cashBalance -= t.amount;
        expenses[t.category] = (expenses[t.category] || 0) + t.amount;
      }
    });

    const totalRevenues = Object.values(revenues).reduce((a, b) => a + b, 0);
    const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0);
    const netProfit = totalRevenues - totalExpenses;

    return {
      cash: cashBalance,
      revenues,
      expenses,
      totalRevenues,
      totalExpenses,
      netProfit
    };
  };

  // Weekly & Monthly Accumulation Calculations
  const getWeeklyAccumulation = () => {
    const data = [];
    const daysName = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLabel = daysName[d.getDay()];
      const dateLabel = d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' });
      
      let income = 0;
      let expense = 0;
      transactions.forEach(t => {
        if (t.date === dateStr) {
          if (t.transaction_type === 'Masuk') {
            income += t.amount;
          } else {
            expense += t.amount;
          }
        }
      });
      
      data.push({ dayLabel, dateLabel, income, expense });
    }
    return data;
  };

  const getMonthlyAccumulation = () => {
    const data = [];
    const now = new Date();
    
    for (let w = 3; w >= 0; w--) {
      const start = new Date();
      start.setDate(now.getDate() - (w + 1) * 7 + 1);
      const end = new Date();
      end.setDate(now.getDate() - w * 7);
      
      start.setHours(0,0,0,0);
      end.setHours(23,59,59,999);
      
      let income = 0;
      let expense = 0;
      
      transactions.forEach(t => {
        const txDate = new Date(t.date);
        txDate.setHours(12,0,0,0);
        if (txDate >= start && txDate <= end) {
          if (t.transaction_type === 'Masuk') {
            income += t.amount;
          } else {
            expense += t.amount;
          }
        }
      });
      
      data.push({
        weekLabel: `Mgg ${4 - w}`,
        income,
        expense
      });
    }
    return data;
  };

  const getCalendarMonthsAccumulation = () => {
    const data = [];
    const now = new Date();
    
    // We want the last 3 months (current month and 2 months prior)
    for (let i = 2; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const monthIndex = d.getMonth();
      const monthLabel = d.toLocaleDateString('id-ID', { month: 'long' });
      
      let income = 0;
      let expense = 0;
      
      transactions.forEach(t => {
        const parts = t.date.split('-');
        if (parts.length === 3) {
          const txYear = parseInt(parts[0], 10);
          const txMonth = parseInt(parts[1], 10) - 1;
          if (txYear === year && txMonth === monthIndex) {
            if (t.transaction_type === 'Masuk') {
              income += t.amount;
            } else {
              expense += t.amount;
            }
          }
        }
      });
      
      data.push({
        monthLabel,
        year,
        income,
        expense
      });
    }
    return data;
  };

  // Wishlist Advice Engine
  const getWishlistAdvice = (tg) => {
    const remaining = Math.max(0, tg.target_amount - tg.current_amount);
    if (remaining === 0) return { monthly: 0, advice: "Selamat! Target wishlist impian ini telah terpenuhi.", feasible: true };
    
    const today = new Date();
    const deadline = new Date(tg.deadline);
    const diffTime = deadline - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const diffMonths = Math.max(1, Math.ceil(diffDays / 30));
    
    const monthly = Math.round(remaining / diffMonths);
    
    const monthlyBudget = budgetPlan ? budgetPlan.monthly_budget : 2000000;
    const totalObs = obligations.reduce((sum, o) => sum + o.amount, 0);
    const sisaUang = Math.max(0, monthlyBudget - totalObs);
    const suggestedSavingRate = sisaUang * 0.20; // 20% savings target
    
    let feasible = true;
    let advice;
    if (monthly <= suggestedSavingRate) {
      advice = `Tabung Rp ${formatRupiah(monthly)}/bulan selama ${diffMonths} bln. Sangat aman bagi sisa anggaran bulanan Anda (alokasi ideal: ${formatRupiah(suggestedSavingRate)}/bulan).`;
    } else if (monthly <= sisaUang) {
      advice = `Tabung Rp ${formatRupiah(monthly)}/bulan selama ${diffMonths} bln. Anda harus mengorbankan pos tersier (gaya hidup) agar target ini tercapai.`;
    } else {
      feasible = false;
      advice = `Nominal tabungan Rp ${formatRupiah(monthly)}/bulan melampaui sisa uang bebas bulanan Anda (${formatRupiah(sisaUang)}). Perpanjang deadline atau kurangi target wishlist.`;
    }
    
    return { monthly, advice, feasible };
  };



  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  const formatRupiah = (num) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(num);
  };

  // Unpaid obligations calculation for alerts
  const finReport = getAccountingReports();
  const unpaidObligationsAmount = obligations.filter(o => !o.paid).reduce((sum, o) => sum + o.amount, 0);
  const showObligationWarning = unpaidObligationsAmount > 0 && finReport.totalRevenues > 0;

  // Render Login & Signup Screen if no active user session
  if (!currentUser) {
    return (
      <div className="auth-portal-fullscreen fade-in">
        <div className="auth-container-desktop">
          <div className="auth-logo-desktop">
            🌙 Mizan App
            <span>KESEIMBANGAN HIDUP & SYARIAH</span>
          </div>

          <div className="auth-card-desktop">
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.4rem', marginBottom: '1.2rem', textAlign: 'center', color: 'var(--text-primary)' }}>
              {authMode === 'login' ? 'Masuk Aplikasi' : 'Daftar Akun Baru'}
            </h3>

            {toast && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: '600',
                marginBottom: '1rem',
                backgroundColor: toast.type === 'error' ? 'var(--accent-light)' : 'var(--primary-light)',
                border: `1px solid ${toast.type === 'error' ? 'var(--accent)' : 'var(--primary)'}`,
                color: 'var(--text-primary)'
              }}>
                {toast.message}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {authMode === 'register' && (
                <div className="form-group">
                  <label style={{ fontWeight: '600', fontSize: '0.85rem' }}>Nama Lengkap</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Nama Lengkap Anda"
                    value={authForm.name}
                    onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label style={{ fontWeight: '600', fontSize: '0.85rem' }}>Alamat Email</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="Alamat Email Anda"
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label style={{ fontWeight: '600', fontSize: '0.85rem' }}>Kata Sandi</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Kata Sandi Anda"
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                  required
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem', width: '100%', padding: '10px' }}>
                {authMode === 'login' ? '🔑 Masuk Akun' : '📝 Daftar Sekarang'}
              </button>
            </form>

            <div style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: '1rem' }}>
              {authMode === 'login' ? (
                <span>Belum punya akun? <button type="button" onClick={() => setAuthMode('register')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', cursor: 'pointer', fontWeight: '600', textDecoration: 'underline', font: 'inherit' }}>Daftar</button></span>
              ) : (
                <span>Sudah punya akun? <button type="button" onClick={() => setAuthMode('login')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', cursor: 'pointer', fontWeight: '600', textDecoration: 'underline', font: 'inherit' }}>Masuk</button></span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active User calculations
  const monthlyBudgetVal = budgetPlan ? budgetPlan.monthly_budget : 2000000;
  const totalObligationsVal = obligations.reduce((sum, o) => sum + o.amount, 0);
  const remainingFreeUang = Math.max(0, monthlyBudgetVal - totalObligationsVal);

  const finReportData = getAccountingReports();
  const nextPrayerVal = getNextPrayerInfo();
  const activeWorshipCount = [worshipTracker.subuh, worshipTracker.dzuhur, worshipTracker.ashar, worshipTracker.maghrib, worshipTracker.isya].filter(Boolean).length;

  const weeklyData = getWeeklyAccumulation();
  const monthlyData = getMonthlyAccumulation();
  const maxWeeklyVal = Math.max(...weeklyData.map(d => Math.max(d.income, d.expense)), 1000);
  const maxMonthlyVal = Math.max(...monthlyData.map(d => Math.max(d.income, d.expense)), 1000);

  const notchAlert = nextPrayerVal.diffMinutes === prayerReminderMin
    ? `Bersiap! Waktu ${nextPrayerVal.nextPrayerName} akan tiba dalam ${prayerReminderMin} menit (${nextPrayerVal.nextPrayerTime}).`
    : null;

  // Reusable Balance Card Component
  const renderBalanceCard = () => (
    <div className="mizan-card" style={{ borderColor: 'var(--primary)', background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--primary-light) 100%)', padding: isMobile ? '1rem' : '1.2rem', gap: '0.8rem', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-secondary)' }}>💰 Ringkasan Saldo Kas</span>
        <span style={{ fontSize: '1.1rem' }}>💸</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: isMobile ? '6px' : '12px', marginTop: '4px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: isMobile ? '0.62rem' : '0.7rem', color: 'var(--text-muted)' }}>Saldo Bebas</span>
          <span style={{ fontSize: isMobile ? '0.92rem' : '1.1rem', fontWeight: 'bold', color: 'var(--primary)' }}>
            {formatRupiah(Math.max(0, finReportData.cash - emergencyFund))}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: isMobile ? '0.62rem' : '0.7rem', color: 'var(--text-muted)' }}>Dana Cadangan</span>
          <span style={{ fontSize: isMobile ? '0.92rem' : '1.1rem', fontWeight: 'bold', color: 'var(--accent)' }}>
            {formatRupiah(emergencyFund)}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: isMobile ? '0.62rem' : '0.7rem', color: 'var(--text-muted)' }}>Total Saldo Asli</span>
          <span style={{ fontSize: isMobile ? '0.92rem' : '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
            {formatRupiah(finReportData.cash)}
          </span>
        </div>
      </div>
    </div>
  );

  const renderChartBar = (keyVal, incHeight, expHeight, dateLabel, income, expense, dayLabel, barWidth, barGap) => (
    <div key={keyVal} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: barGap, height: '60px' }} title={`${dateLabel}\nMasuk: ${formatRupiah(income)}\nKeluar: ${formatRupiah(expense)}`}>
        <div style={{ width: barWidth, height: `${incHeight}px`, backgroundColor: 'var(--primary)', borderRadius: '2px' }}></div>
        <div style={{ width: barWidth, height: `${expHeight}px`, backgroundColor: 'var(--accent)', borderRadius: '2px' }}></div>
      </div>
      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: '600' }}>{dayLabel}</span>
    </div>
  );

  return (
    <div className="dashboard-container fade-in">
      
      {/* Sidebar Navigation (Hidden on Mobile) */}
      {!isMobile && (
        <aside className="sidebar-nav">
          <div className="sidebar-brand">
            🌙 Mizan App
          </div>

          <div className="sidebar-user">
            <span className="welcome-text">Assalamu'alaikum,</span>
            <span className="username-display">{currentUser.username}</span>
          </div>

          <nav className="sidebar-menu">
            <button onClick={() => setActiveTab('dashboard')} className={`sidebar-item ${activeTab === 'dashboard' ? 'active' : ''}`}>
              <span style={{ fontSize: '1.1rem' }}>🏠</span>
              <span>Beranda</span>
            </button>
            <button onClick={() => setActiveTab('finance')} className={`sidebar-item ${activeTab === 'finance' ? 'active' : ''}`}>
              <span style={{ fontSize: '1.1rem' }}>💸</span>
              <span>Keuangan</span>
            </button>
            <button onClick={() => setActiveTab('islamic')} className={`sidebar-item ${activeTab === 'islamic' ? 'active' : ''}`}>
              <span style={{ fontSize: '1.1rem' }}>🕌</span>
              <span>Islami</span>
            </button>
            <button onClick={() => setActiveTab('health')} className={`sidebar-item ${activeTab === 'health' ? 'active' : ''}`}>
              <span style={{ fontSize: '1.1rem' }}>🍏</span>
              <span>Kesehatan</span>
            </button>
          </nav>

          <button onClick={handleLogout} className="sidebar-logout-btn">
            🚪 Keluar
          </button>
        </aside>
      )}

      {/* Main Content Layout */}
      <div className="main-content-layout" style={{ paddingBottom: isMobile ? '80px' : '2rem' }}>
        
        {/* Mobile Header */}
        {isMobile && (
          <header style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-secondary)',
            padding: '10px 16px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            marginBottom: '0.8rem',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Assalamu'alaikum,</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 'bold', fontFamily: 'var(--font-serif)' }}>{currentUser.username}</div>
            </div>
            <button 
              onClick={handleLogout}
              style={{ padding: '3px 8px', fontSize: '0.65rem', border: '1px solid var(--accent)', color: 'var(--accent)', background: 'transparent', borderRadius: '8px', cursor: 'pointer' }}
            >
              🚪 Keluar
            </button>
          </header>
        )}

        {/* Unpaid Obligations Notification Warning */}
        {showObligationWarning && (
          <div className="toast-banner warning" style={{ borderLeft: '4px solid var(--accent)', background: 'var(--accent-light)' }}>
            ⚠️ <b>Pengingat Kewajiban:</b> Anda memiliki kewajiban bulanan belum lunas sebesar <b>{formatRupiah(unpaidObligationsAmount)}</b>. Segera bayar untuk menjaga kestabilan finansial Anda!
          </div>
        )}

        {/* Dynamic Warning Alerts & Toast Messages */}
        {toast && (
          <div className={`toast-banner ${toast.type}`}>
            {toast.type === 'warning' ? '⚠️' : (toast.type === 'error' ? '❌' : '✅')} {toast.message}
          </div>
        )}
        {notchAlert && (
          <div className="toast-banner warning">
            🕌 {notchAlert}
          </div>
        )}

        <div className="dashboard-page-content">
          
          {/* TAB 1: BERANDA */}
          {activeTab === 'dashboard' && (
            <div className="dashboard-grid">
              
              {/* Prominent Balance Display */}
              <div style={{ gridColumn: isMobile ? 'span 1' : 'span 3', width: '100%' }}>
                {renderBalanceCard()}
              </div>

              {/* Mizan Score Card */}
              <div className="mizan-card" style={{ borderColor: 'var(--primary)', padding: '1.5rem', gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                <div className="mizan-card-title" style={{ marginBottom: '1rem' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Skor Keseimbangan Mizan</span>
                  <span className="badge-mizan finance" style={{ backgroundColor: mizanScoreData.score >= 80 ? 'var(--primary-light)' : 'var(--warning-light)', color: mizanScoreData.score >= 80 ? 'var(--primary)' : 'var(--warning)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: '600' }}>
                    {mizanScoreData.score >= 80 ? 'Seimbang' : 'Perlu Selaras'}
                  </span>
                </div>

                <div className="health-score-container" style={{ gap: '30px', alignItems: 'center', flexDirection: isMobile ? 'column' : 'row' }}>
                  <div className="health-score-circle" style={{ width: '100px', height: '100px', position: 'relative', flexShrink: 0 }}>
                    <svg width="100" height="100" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--border-color)" strokeWidth="3.2" />
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--primary)" strokeWidth="3.2" strokeDasharray={`${mizanScoreData.score}, 100`} />
                    </svg>
                    <div className="health-score-value" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ fontSize: '1.8rem', fontWeight: 'bold', lineHeight: '1' }}>{mizanScoreData.score}</span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Indeks</span>
                    </div>
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span>💼 Finansial (40%)</span>
                        <span style={{ fontWeight: '600' }}>{mizanScoreData.financial}/100</span>
                      </div>
                      <div className="budget-bar-container" style={{ height: '6px' }}>
                        <div className="budget-bar-fill" style={{ width: `${mizanScoreData.financial}%`, backgroundColor: 'var(--primary)' }}></div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span>🕌 Ibadah (30%)</span>
                        <span style={{ fontWeight: '600' }}>{mizanScoreData.worship}/100</span>
                      </div>
                      <div className="budget-bar-container" style={{ height: '6px' }}>
                        <div className="budget-bar-fill" style={{ width: `${mizanScoreData.worship}%`, backgroundColor: 'var(--primary)' }}></div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span>🍏 Kesehatan (30%)</span>
                        <span style={{ fontWeight: '600' }}>{mizanScoreData.health}/100</span>
                      </div>
                      <div className="budget-bar-container" style={{ height: '6px' }}>
                        <div className="budget-bar-fill" style={{ width: `${mizanScoreData.health}%`, backgroundColor: 'var(--primary)' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Real-time Prayer countdown Widget */}
              <div className="mizan-card" style={{ padding: '1.5rem', justifyContent: 'center' }}>
                <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                  <select 
                    value={city} 
                    onChange={(e) => setCity(e.target.value)} 
                    style={{ background: 'var(--bg-tertiary)', border: 'none', borderRadius: '6px', padding: '4px 8px', fontWeight: '700', fontSize: '0.85rem', outline: 'none', color: 'var(--text-secondary)' }}
                  >
                    <option value="Jakarta">📍 Jakarta</option>
                    <option value="Surabaya">📍 Surabaya</option>
                    <option value="Bandung">📍 Bandung</option>
                    <option value="Yogyakarta">📍 Yogyakarta</option>
                    <option value="Medan">📍 Medan</option>
                    <option value="Makassar">📍 Makassar</option>
                  </select>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>Waktu Shalat</span>
                </div>
                <div style={{ fontSize: '2.2rem', fontWeight: 'bold', fontFamily: 'monospace', textAlign: 'center', margin: '0.5rem 0', color: 'var(--text-primary)' }}>
                  {time.toLocaleTimeString('id-ID')}
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '6px' }}>
                  Selanjutnya: <b>{nextPrayerVal.nextPrayerName} ({nextPrayerVal.nextPrayerTime})</b>
                  <div style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: '700', marginTop: '4px' }}>
                    ⌛ Hitung Mundur: {nextPrayerVal.countdown}
                  </div>
                </div>
              </div>

              {/* Mizan AI Financial Chatbot (New Feature) */}
              <div className="mizan-card" style={{ padding: '1.5rem', gridColumn: isMobile ? 'span 1' : 'span 2', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div className="mizan-card-title">
                  <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>💬 Chat Asisten Mizan AI</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Membantu Solusi Keuangan</span>
                </div>
                
                {/* Chat History scroll box */}
                <div className="chat-history" style={{ height: '200px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-primary)' }}>
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className={`chat-message ${msg.sender}`} style={{
                      alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                      backgroundColor: msg.sender === 'user' ? 'var(--primary-light)' : 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      padding: '8px 12px',
                      borderRadius: msg.sender === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0',
                      maxWidth: '85%',
                      fontSize: '0.8rem',
                      lineHeight: '1.4',
                      color: 'var(--text-primary)',
                      whiteSpace: 'pre-line',
                      boxShadow: 'var(--shadow-sm)'
                    }}>
                      {msg.text}
                    </div>
                  ))}
                  {isTyping && (
                    <div className="chat-message bot" style={{ alignSelf: 'flex-start', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '6px 12px', borderRadius: '12px 12px 12px 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <i>Mizan AI sedang mengetik...</i>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                
                {/* Chat input form */}
                <form onSubmit={handleSendChatMessage} style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text" 
                    placeholder="Tanya AI: 'apakah saya boros?', 'bagaimana sisa saldo?'..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="form-control"
                    style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}
                  />
                  <button type="submit" className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                    Kirim
                  </button>
                </form>
              </div>

              {/* Reminders list */}
              <div className="mizan-card" style={{ padding: '1.5rem', gap: '0.8rem' }}>
                <div className="mizan-card-title" style={{ fontSize: '1rem', fontWeight: '700' }}>Pengingat Aktivitas</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                    <span>💧 Minum Air ({healthTracker.water}/8 Gelas)</span>
                    <span style={{ color: healthTracker.water >= 8 ? 'var(--primary)' : 'var(--accent)', fontWeight: '700' }}>
                      {healthTracker.water >= 8 ? 'Selesai' : 'Kurang'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                    <span>🕌 Shalat Wajib ({activeWorshipCount}/5 Waktu)</span>
                    <span style={{ color: activeWorshipCount === 5 ? 'var(--primary)' : 'var(--warning)', fontWeight: '700' }}>
                      {activeWorshipCount === 5 ? 'Lengkap' : 'Belum Lengkap'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', paddingBottom: '4px' }}>
                    <span>🛌 Tidur Semalam ({healthTracker.sleep_hours} Jam)</span>
                    <span style={{ color: healthTracker.sleep_hours >= 7 ? 'var(--primary)' : 'var(--accent)', fontWeight: '700' }}>
                      {healthTracker.sleep_hours >= 7 ? 'Cukup' : 'Kurang'}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: KEUANGAN & AKUNTANSI */}
          {activeTab === 'finance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Balance card */}
              {renderBalanceCard()}

              {/* Sub tabs navigation */}
              <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-tertiary)', padding: '6px', borderRadius: '8px', maxWidth: '400px' }}>
                {['pencatatan', 'jurnal', 'laporan'].map((sub) => (
                  <button
                    key={sub}
                    onClick={() => {
                      setFinanceSubTab(sub);
                      if (sub !== 'pencatatan') cancelEdit();
                    }}
                    className="theme-toggle-btn"
                    style={{
                      flex: 1,
                      border: 'none',
                      padding: '6px 12px',
                      fontSize: '0.85rem',
                      background: financeSubTab === sub ? 'var(--bg-secondary)' : 'transparent',
                      color: financeSubTab === sub ? 'var(--text-primary)' : 'var(--text-muted)'
                    }}
                  >
                    {sub === 'pencatatan' ? '📝 Buku Kas' : (sub === 'jurnal' ? '📖 Jurnal' : '📊 Laporan')}
                  </button>
                ))}
              </div>

              {/* Sub tab content: PENCATATAN */}
              {financeSubTab === 'pencatatan' && (
                <div className="finance-grid" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1fr 1.3fr', gap: '1.2rem', alignItems: 'start' }}>
                  
                  {/* Left Column: Transaction Form & Monthly Obligations */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    
                    {/* Add/Edit Transaction form */}
                    <div className="mizan-card" style={{ padding: '1.5rem' }}>
                      <div className="mizan-card-title" style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                        {isEditing ? '✏️ Edit Transaksi' : '📝 Pencatatan Arus Kas'}
                      </div>
                      <form onSubmit={handleAddTransaction} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div className="form-group">
                            <label style={{ fontWeight: '600', fontSize: '0.8rem' }}>Jenis</label>
                            <select 
                              value={txForm.transaction_type}
                              onChange={(e) => setTxForm({ ...txForm, transaction_type: e.target.value })}
                              className="form-control"
                            >
                              <option value="Keluar">Pengeluaran</option>
                              <option value="Masuk">Pemasukan</option>
                            </select>
                          </div>
                          <div className="form-group">
                            <label style={{ fontWeight: '600', fontSize: '0.8rem' }}>Sumber / Kategori</label>
                            <select
                              value={txForm.category}
                              onChange={(e) => setTxForm({ ...txForm, category: e.target.value })}
                              className="form-control"
                            >
                              {txForm.transaction_type === 'Masuk' ? (
                                <>
                                  <option value="gaji">Gaji</option>
                                  <option value="uang_saku">Uang Saku</option>
                                  <option value="freelance">Freelance</option>
                                  <option value="hadiah">Hadiah</option>
                                  <option value="bonus">Bonus</option>
                                  <option value="beasiswa">Beasiswa</option>
                                  <option value="investasi">Investasi</option>
                                  <option value="penjualan_barang">Penjualan Barang</option>
                                  <option value="lainnya">Lainnya</option>
                                </>
                              ) : (
                                Object.keys(CATEGORY_TO_SYARIAH_MAP).map(key => (
                                  <option key={key} value={key}>
                                    {CATEGORY_TO_SYARIAH_MAP[key].label}
                                  </option>
                                ))
                              )}
                            </select>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '10px' }}>
                          <div className="form-group">
                            <label style={{ fontWeight: '600', fontSize: '0.8rem' }}>Nominal (Rp)</label>
                            <input
                              type="number"
                              placeholder="Contoh: 50000"
                              value={txForm.amount}
                              onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                              className="form-control"
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label style={{ fontWeight: '600', fontSize: '0.8rem' }}>Tanggal</label>
                            <input
                              type="date"
                              value={txForm.date}
                              onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
                              className="form-control"
                              required
                            />
                          </div>
                        </div>

                        <div className="form-group">
                          <label style={{ fontWeight: '600', fontSize: '0.8rem' }}>Deskripsi</label>
                          <input
                            type="text"
                            placeholder="Ketik keterangan transaksi..."
                            value={txForm.description}
                            onChange={(e) => setTxForm({ ...txForm, description: e.target.value })}
                            className="form-control"
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                          <button type="submit" className="btn-primary" style={{ flex: 1, padding: '8px' }}>
                            {isEditing ? 'Perbarui Transaksi' : '💾 Simpan Transaksi'}
                          </button>
                          {isEditing && (
                            <button type="button" onClick={cancelEdit} className="theme-toggle-btn" style={{ padding: '8px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                              Batal
                            </button>
                          )}
                        </div>
                      </form>
                    </div>

                    {/* Monthly obligations setup & checklist (New Feature) */}
                    <div className="mizan-card" style={{ padding: '1.5rem', gap: '0.6rem' }}>
                      <div className="mizan-card-title" style={{ fontSize: '1rem', fontWeight: 'bold' }}>🗓️ Perencanaan Kewajiban Bulanan</div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>Daftarkan kewajiban pembayaran rutin di awal bulan. Ketika pemasukan dicatat, Anda akan diingatkan untuk membayar.</span>
                      
                      {/* Obligations list */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto', marginTop: '6px' }}>
                        {obligations.map(ob => (
                          <div key={ob.ob_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: ob.paid ? 'var(--primary-light)' : 'var(--bg-secondary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input 
                                type="checkbox" 
                                checked={ob.paid} 
                                onChange={() => toggleObligationPaid(ob.ob_id)}
                                style={{ width: '15px', height: '15px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                              />
                              <div style={{ textDecoration: ob.paid ? 'line-through' : 'none', color: ob.paid ? 'var(--text-muted)' : 'var(--text-primary)', fontSize: '0.8rem', fontWeight: '600' }}>
                                {ob.title}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: '700', color: ob.paid ? 'var(--text-muted)' : 'var(--accent)' }}>
                                {formatRupiah(ob.amount)}
                              </span>
                              <button onClick={() => handleDeleteObligation(ob.ob_id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.75rem' }}>❌</button>
                            </div>
                          </div>
                        ))}
                        {obligations.length === 0 && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Belum ada kewajiban terdaftar.</span>
                        )}
                      </div>

                      {/* Add new obligation form */}
                      <form onSubmit={handleAddObligation} style={{ display: 'flex', gap: '6px', borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '4px' }}>
                        <input 
                          type="text" 
                          placeholder="Kewajiban (cth: Kos, Internet)"
                          value={newObForm.title}
                          onChange={(e) => setNewObForm({ ...newObForm, title: e.target.value })}
                          className="form-control"
                          style={{ flex: 1, padding: '4px', fontSize: '0.75rem' }}
                          required
                        />
                        <input 
                          type="number" 
                          placeholder="Nominal Rp"
                          value={newObForm.amount}
                          onChange={(e) => setNewObForm({ ...newObForm, amount: e.target.value })}
                          className="form-control"
                          style={{ width: '90px', padding: '4px', fontSize: '0.75rem' }}
                          required
                        />
                        <button type="submit" className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>+</button>
                      </form>

                      {/* AI Budget division prediction */}
                      {obligations.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)' }}>💡 AI Prediksi Pembagian Sisa Uang:</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                            Berdasarkan sisa anggaran bebas bulanan sebesar <b>{formatRupiah(remainingFreeUang)}</b> (anggaran dikurangi total kewajiban), berikut pembagian ideal untuk mahasiswa:
                            <br />• <b>Kebutuhan Pokok Non-Rutin (50%):</b> {formatRupiah(remainingFreeUang * 0.5)} (Makan harian, transport)
                            <br />• <b>Tabungan Wishlist (20%):</b> {formatRupiah(remainingFreeUang * 0.2)} (Disimpan/investasi)
                            <br />• <b>Belajar & Hiburan Flexibel (30%):</b> {formatRupiah(remainingFreeUang * 0.3)} (Kopi, buku)
                          </span>
                        </div>
                      )}
                    </div>

                  </div>

                  {/* Middle Column: Financial Accumulations & Balances */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    
                    {/* Visual Charts: Weekly & Monthly Accumulation */}
                    <div className="mizan-card" style={{ padding: '1.2rem', gap: '0.8rem' }}>
                      <div className="mizan-card-title" style={{ fontSize: '0.95rem', fontWeight: 'bold' }}>📈 Akumulasi Penggunaan Uang</div>
                      
                      {/* Weekly Chart */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Grafik 7 Hari Terakhir</span>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '80px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginTop: '6px' }}>
                          {weeklyData.map((d, i) => {
                            const incHeight = maxWeeklyVal > 0 ? (d.income / maxWeeklyVal) * 60 : 0;
                            const expHeight = maxWeeklyVal > 0 ? (d.expense / maxWeeklyVal) * 60 : 0;
                            return renderChartBar(i, incHeight, expHeight, `Tgl ${d.dateLabel}`, d.income, d.expense, d.dayLabel, '6px', '2px');
                          })}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', fontSize: '0.65rem', justifyContent: 'center', marginTop: '4px' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '8px', height: '8px', backgroundColor: 'var(--primary)', borderRadius: '50%' }}></div> Masuk (Hijau)</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '8px', height: '8px', backgroundColor: 'var(--accent)', borderRadius: '50%' }}></div> Keluar (Terracotta)</span>
                        </div>
                      </div>

                    </div>

                    {/* Emergency Fund Setup */}
                    <div className="mizan-card" style={{ padding: '1.2rem', gap: '0.6rem' }}>
                      <div className="mizan-card-title" style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Pemisahan Dana Cadangan</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flex: 1 }}>Dana Cadangan:</span>
                        <input 
                          type="number" 
                          value={emergencyFund} 
                          onChange={(e) => setEmergencyFund(parseFloat(e.target.value) || 0)} 
                          className="form-control"
                          style={{ width: '110px', padding: '4px 8px', fontSize: '0.8rem', height: '28px' }}
                        />
                      </div>
                    </div>

                  </div>

                  {/* Right Column: Daily Transaction History & Wishlist Target Form */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    
                    {/* Daily Cash Flow History */}
                    <div className="mizan-card" style={{ padding: '1.5rem', maxHeight: '250px', display: 'flex', flexDirection: 'column' }}>
                      <div className="mizan-card-title" style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.6rem' }}>
                        Riwayat Kas Harian
                      </div>
                      <div className="tx-list" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {transactions.map(t => (
                          <div key={t.trans_id} className="tx-item" style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', boxShadow: 'var(--shadow-sm)' }}>
                            <div>
                              <div style={{ fontWeight: '600', fontSize: '0.8rem' }}>{t.description}</div>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{t.date} • {t.priority_tag}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: '700', color: t.transaction_type === 'Masuk' ? 'var(--primary)' : 'var(--text-primary)' }}>
                                {t.transaction_type === 'Masuk' ? '+' : '-'}{formatRupiah(t.amount)}
                              </span>
                              <div style={{ display: 'flex', gap: '2px' }}>
                                <button onClick={() => handleEditTxClick(t)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.75rem' }}>✏️</button>
                                <button onClick={() => handleDeleteTx(t.trans_id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.75rem' }}>❌</button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {transactions.length === 0 && (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', margin: 'auto' }}>Belum ada pencatatan kas.</span>
                        )}
                      </div>
                    </div>

                    {/* Wishlist Impian & Target Tabungan (With Savings advice & feasibility check) */}
                    <div className="mizan-card" style={{ padding: '1.5rem', gap: '0.6rem' }}>
                      <div className="mizan-card-title" style={{ fontSize: '1rem', fontWeight: 'bold' }}>🛒 Target Wishlist & Tabungan Impian</div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                        {targets.map(tg => {
                          const percent = Math.min(100, Math.round((tg.current_amount / tg.target_amount) * 100));
                          const advice = getWishlistAdvice(tg);
                          return (
                            <div key={tg.target_id} style={{ padding: '10px', border: '1px solid var(--border-color)', borderRadius: '10px', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: '600' }}>
                                <span>🎁 {tg.title}</span>
                                <span>{percent}%</span>
                              </div>
                              <div className="budget-bar-container" style={{ height: '4px' }}>
                                <div className="budget-bar-fill" style={{ width: `${percent}%`, backgroundColor: 'var(--primary)' }}></div>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                <span>{formatRupiah(tg.current_amount)} / {formatRupiah(tg.target_amount)}</span>
                                <span>Batas: {tg.deadline}</span>
                              </div>

                              {/* AI advice for this wishlist */}
                              <div style={{ fontSize: '0.65rem', color: advice.feasible ? 'var(--text-secondary)' : 'var(--accent)', backgroundColor: 'var(--bg-primary)', padding: '6px', borderRadius: '4px', marginTop: '2px', borderLeft: `2px solid ${advice.feasible ? 'var(--primary)' : 'var(--accent)'}`, lineHeight: '1.3' }}>
                                💡 <b>Saran AI:</b> {advice.advice}
                              </div>
                              
                              <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                <input
                                  type="number"
                                  placeholder="Setor Rp"
                                  value={targetAddAmounts[tg.target_id] || ''}
                                  onChange={(e) => setTargetAddAmounts({ ...targetAddAmounts, [tg.target_id]: e.target.value })}
                                  className="form-control"
                                  style={{ flex: 1, padding: '2px 6px', fontSize: '0.75rem', height: '22px' }}
                                />
                                <button 
                                  onClick={() => handleAddFundToTarget(tg.target_id, tg.title)}
                                  style={{ padding: '0 8px', fontSize: '0.75rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                  Setor
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {targets.length === 0 && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Belum ada wishlist impian. Tambahkan di bawah!</span>
                        )}
                      </div>

                      {/* Add new wishlist form */}
                      <form onSubmit={handleAddWishlistTarget} style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '4px' }}>
                        <input 
                          type="text" 
                          placeholder="Nama Wishlist (contoh: Laptop Baru, Beli Buku)" 
                          value={newTargetForm.title}
                          onChange={(e) => setNewTargetForm({ ...newTargetForm, title: e.target.value })}
                          className="form-control" 
                          style={{ padding: '4px', fontSize: '0.75rem' }}
                          required
                        />
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <input 
                            type="number" 
                            placeholder="Target Rp" 
                            value={newTargetForm.target_amount}
                            onChange={(e) => setNewTargetForm({ ...newTargetForm, target_amount: e.target.value })}
                            className="form-control" 
                            style={{ flex: 1, padding: '4px', fontSize: '0.75rem' }}
                            required
                          />
                          <input 
                            type="date" 
                            value={newTargetForm.deadline}
                            onChange={(e) => setNewTargetForm({ ...newTargetForm, deadline: e.target.value })}
                            className="form-control" 
                            style={{ flex: 1, padding: '4px', fontSize: '0.75rem' }}
                            required
                          />
                        </div>
                        <button type="submit" className="btn-primary" style={{ padding: '4px', fontSize: '0.75rem' }}>+ Tambah Wishlist</button>
                      </form>
                    </div>

                  </div>

                </div>
              )}

              {/* Sub tab content: JURNAL */}
              {financeSubTab === 'jurnal' && (
                <div className="mizan-card" style={{ padding: '1.5rem', gap: '0.8rem' }}>
                  <div className="mizan-card-title" style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Jurnal Umum (Double-Entry)</div>
                  <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
                    <table className="accounting-table">
                      <thead>
                        <tr>
                          <th>Tanggal</th>
                          <th>Akun & Keterangan</th>
                          <th style={{ textAlign: 'right' }}>Debit (Rp)</th>
                          <th style={{ textAlign: 'right' }}>Kredit (Rp)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getGeneralJournal().map((entry) => (
                          <tr key={entry.id} className={entry.type === 'credit' ? 'credit-row' : ''}>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem', verticalAlign: 'top', padding: '10px' }}>
                              {entry.type === 'debit' ? entry.date : ''}
                            </td>
                            <td style={{ padding: '10px' }}>
                              <div style={{ fontWeight: '600', fontSize: '0.85rem', paddingLeft: entry.type === 'credit' ? '20px' : '0px' }}>{entry.account}</div>
                              {entry.type === 'debit' && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>({entry.desc})</div>}
                            </td>
                            <td style={{ textAlign: 'right', padding: '10px', fontSize: '0.85rem' }}>{entry.debit > 0 ? formatRupiah(entry.debit) : '-'}</td>
                            <td style={{ textAlign: 'right', padding: '10px', fontSize: '0.85rem' }}>{entry.credit > 0 ? formatRupiah(entry.credit) : '-'}</td>
                          </tr>
                        ))}
                        {transactions.length === 0 && (
                          <tr>
                            <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Belum ada data jurnal keuangan.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sub tab content: LAPORAN */}
              {financeSubTab === 'laporan' && (() => {
                const totalExp = finReportData.totalExpenses;
                const categoryItems = Object.entries(finReportData.expenses).map(([key, value]) => {
                  const pct = totalExp > 0 ? (value / totalExp) * 100 : 0;
                  const label = CATEGORY_TO_SYARIAH_MAP[key]?.label || key;
                  return { key, label, value, pct };
                }).sort((a, b) => b.value - a.value);

                let tempSum = 0;
                const accumulatedPercentBefore = categoryItems.map(item => {
                  const current = tempSum;
                  tempSum += item.pct;
                  return current;
                });
                const donutCircumference = 251.327; // 2 * Math.PI * 40
                const CHART_COLORS = [
                  '#8fa088', // Sage green
                  '#dca084', // Terracotta
                  '#e5c088', // Ochre gold
                  '#70685c', // Warm slate
                  '#a39889', // Sand dust
                  '#6b7f67', // Darker sage
                  '#c58c73', // Darker terracotta
                  '#ceab70', // Darker gold
                  '#5c5346', // Muted brown
                  '#889ca0', // Soft blue-grey
                ];

                const trendList = getCalendarMonthsAccumulation();
                const trendMax = Math.max(...trendList.map(x => Math.max(x.income, x.expense)), 1000);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
                      
                      {/* 1. Cash Flow Summary */}
                      <div className="mizan-card" style={{ padding: '1.5rem', gap: '1rem' }}>
                        <div className="mizan-card-title">
                          <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>📈 Ringkasan Arus Kas</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Bulan Ini</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.85rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                            <span>Total Pemasukan</span>
                            <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{formatRupiah(finReportData.totalRevenues)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                            <span>Total Pengeluaran</span>
                            <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>-{formatRupiah(finReportData.totalExpenses)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '1rem', paddingTop: '6px', color: finReportData.netProfit >= 0 ? 'var(--primary)' : 'var(--accent)' }}>
                            <span>Surplus / Sisa Uang</span>
                            <span style={{ borderBottom: '2px double currentColor', paddingBottom: '2px' }}>{formatRupiah(finReportData.netProfit)}</span>
                          </div>
                        </div>
                      </div>

                      {/* 2. Monthly Trend Chart */}
                      <div className="mizan-card" style={{ padding: '1.5rem', gap: '1rem' }}>
                        <div className="mizan-card-title">
                          <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>📊 Tren Keuangan Bulanan</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>3 Bulan Terakhir</span>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: '90px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', paddingTop: '10px' }}>
                            {trendList.map((m, idx) => {
                              const incHeight = (m.income / trendMax) * 70;
                              const expHeight = (m.expense / trendMax) * 70;
                              return (
                                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '70px' }} title={`${m.monthLabel} ${m.year}\nMasuk: ${formatRupiah(m.income)}\nKeluar: ${formatRupiah(m.expense)}`}>
                                    <div style={{ width: '14px', height: `${incHeight}px`, backgroundColor: 'var(--primary)', borderRadius: '2px', transition: 'height 0.3s' }}></div>
                                    <div style={{ width: '14px', height: `${expHeight}px`, backgroundColor: 'var(--accent)', borderRadius: '2px', transition: 'height 0.3s' }}></div>
                                  </div>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: '600', textAlign: 'center' }}>
                                    {m.monthLabel.substring(0, 3)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          
                          <div style={{ display: 'flex', gap: '12px', fontSize: '0.65rem', justifyContent: 'center', marginTop: '2px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <div style={{ width: '8px', height: '8px', backgroundColor: 'var(--primary)', borderRadius: '50%' }}></div>
                              Masuk
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <div style={{ width: '8px', height: '8px', backgroundColor: 'var(--accent)', borderRadius: '50%' }}></div>
                              Keluar
                            </span>
                          </div>
                        </div>
                      </div>
                      
                    </div>

                    {/* 3. Interactive Expense Pie (Donut) Chart */}
                    <div className="mizan-card" style={{ padding: '1.5rem', gap: '1rem' }}>
                      <div className="mizan-card-title">
                        <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>📊 Proporsi Pengeluaran Dinamis</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Interaktif</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1.5rem', alignItems: 'center', justifyContent: 'space-around' }}>
                        {/* Circle SVG */}
                        <div style={{ position: 'relative', width: '130px', height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="130" height="130" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
                            {categoryItems.length === 0 ? (
                              <circle
                                cx="50"
                                cy="50"
                                r="40"
                                fill="transparent"
                                stroke="var(--border-color)"
                                strokeWidth="12"
                              />
                            ) : (
                              categoryItems.map((cat, idx) => {
                                const strokeDasharray = `${(cat.pct / 100) * donutCircumference} ${donutCircumference}`;
                                const strokeDashoffset = donutCircumference - (accumulatedPercentBefore[idx] / 100) * donutCircumference;
                                return (
                                  <circle
                                    key={cat.key}
                                    cx="50"
                                    cy="50"
                                    r="40"
                                    fill="transparent"
                                    stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                                    strokeWidth={hoveredExpenseIdx === idx ? "15" : "12"}
                                    strokeDasharray={strokeDasharray}
                                    strokeDashoffset={strokeDashoffset}
                                    style={{ cursor: 'pointer', transition: 'stroke-width 0.15s, opacity 0.15s', opacity: hoveredExpenseIdx === null || hoveredExpenseIdx === idx ? 1 : 0.6 }}
                                    onMouseEnter={() => setHoveredExpenseIdx(idx)}
                                    onMouseLeave={() => setHoveredExpenseIdx(null)}
                                  />
                                );
                              })
                            )}
                          </svg>
                          <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                            {hoveredExpenseIdx !== null ? (
                              <>
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>{categoryItems[hoveredExpenseIdx].label}</span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: CHART_COLORS[hoveredExpenseIdx % CHART_COLORS.length] }}>{categoryItems[hoveredExpenseIdx].pct.toFixed(0)}%</span>
                              </>
                            ) : (
                              <>
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Total Beban</span>
                                <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{formatRupiah(totalExp)}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Legend */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                          {categoryItems.length === 0 ? (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>Belum ada pengeluaran bulan ini.</div>
                          ) : (
                            categoryItems.map((cat, idx) => (
                              <div 
                                key={cat.key}
                                onMouseEnter={() => setHoveredExpenseIdx(idx)}
                                onMouseLeave={() => setHoveredExpenseIdx(null)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  backgroundColor: hoveredExpenseIdx === idx ? 'var(--bg-tertiary)' : 'transparent',
                                  transition: 'background-color 0.2s',
                                  fontSize: '0.78rem'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}></div>
                                  <span style={{ fontWeight: hoveredExpenseIdx === idx ? 'bold' : 'normal', color: 'var(--text-primary)' }}>{cat.label}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-secondary)' }}>
                                  <span>{formatRupiah(cat.value)}</span>
                                  <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-muted)', width: '32px', textAlign: 'right' }}>{cat.pct.toFixed(0)}%</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 4. Savings Goal Milestones */}
                    <div className="mizan-card" style={{ padding: '1.5rem', gap: '1rem' }}>
                      <div className="mizan-card-title">
                        <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>🎯 Pencapaian Gol Keuangan</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Wishlist Impian</span>
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                        {targets.length === 0 ? (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic', padding: '10px 0' }}>
                            Belum ada target wishlist aktif. Tambahkan wishlist di tab Buku Kas.
                          </div>
                        ) : (
                          targets.map(tg => {
                            const percent = Math.min(100, Math.round((tg.current_amount / tg.target_amount) * 100));
                            const advice = getWishlistAdvice(tg);
                            return (
                              <div key={tg.target_id} style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                  <span style={{ fontWeight: '700' }}>🎁 {tg.title}</span>
                                  <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{percent}%</span>
                                </div>
                                
                                <div style={{ height: '8px', width: '100%', backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                                  <div style={{ height: '100%', width: `${percent}%`, backgroundColor: 'var(--primary)', transition: 'width 0.3s' }}></div>
                                </div>
                                
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                  <span>{formatRupiah(tg.current_amount)} / {formatRupiah(tg.target_amount)}</span>
                                  <span>Tenggat: {new Date(tg.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                </div>
                                
                                <div style={{ fontSize: '0.7rem', color: advice.feasible ? 'var(--primary)' : 'var(--accent)', fontWeight: '600', borderTop: '1px dashed var(--border-color)', paddingTop: '4px', marginTop: '2px' }}>
                                  💡 {advice.advice}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* 5. Unduh Laporan Button */}
                    <button 
                      onClick={handleDownloadReport} 
                      className="btn-primary" 
                      style={{ 
                        width: '100%', 
                        padding: '12px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '8px', 
                        fontSize: '0.9rem', 
                        fontWeight: 'bold',
                        boxShadow: 'var(--shadow-md)'
                      }}
                    >
                      📥 Unduh Laporan Keuangan & Evaluasi AI (.txt)
                    </button>
                    
                  </div>
                );
              })()}

            </div>
          )}

          {/* TAB 3: ISLAMI (IBADAH & TASBIH DIGITAL) */}
          {activeTab === 'islamic' && (
            <div className="dashboard-grid">
              
              {/* Daily Hadith / Spiritual Quote */}
              <div className="mizan-card" style={{ padding: '1.5rem', gridColumn: isMobile ? 'span 1' : 'span 2', borderColor: 'var(--warning)', background: 'var(--warning-light)', gap: '6px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>QS / Hadits Harian Penyeimbang Hidup</span>
                <p style={{ fontSize: '0.9rem', fontStyle: 'italic', color: 'var(--text-primary)', margin: '4px 0', lineHeight: '1.5' }}>
                  "{HADITS_QUOTES[haditsIndex].text}"
                </p>
                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textAlign: 'right', display: 'block' }}>
                  — {HADITS_QUOTES[haditsIndex].source}
                </span>
              </div>

              {/* Worship tracker Checklist */}
              <div className="mizan-card" style={{ padding: '1.5rem', gap: '1rem' }}>
                <div className="mizan-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Pelacak Ibadah Harian</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Meningkatkan Mizan Score</span>
                </div>
                
                <div className="worship-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <button onClick={() => toggleWorship('subuh')} className={`worship-btn ${worshipTracker.subuh ? 'active' : ''}`} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: worshipTracker.subuh ? 'var(--primary-light)' : 'var(--bg-secondary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '1.2rem' }}>🌅</span><span style={{ fontSize: '0.8rem', fontWeight: '600' }}>Subuh</span>
                  </button>
                  <button onClick={() => toggleWorship('dzuhur')} className={`worship-btn ${worshipTracker.dzuhur ? 'active' : ''}`} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: worshipTracker.dzuhur ? 'var(--primary-light)' : 'var(--bg-secondary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '1.2rem' }}>☀️</span><span style={{ fontSize: '0.8rem', fontWeight: '600' }}>Dzuhur</span>
                  </button>
                  <button onClick={() => toggleWorship('ashar')} className={`worship-btn ${worshipTracker.ashar ? 'active' : ''}`} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: worshipTracker.ashar ? 'var(--primary-light)' : 'var(--bg-secondary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '1.2rem' }}>🌤️</span><span style={{ fontSize: '0.8rem', fontWeight: '600' }}>Ashar</span>
                  </button>
                  <button onClick={() => toggleWorship('maghrib')} className={`worship-btn ${worshipTracker.maghrib ? 'active' : ''}`} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: worshipTracker.maghrib ? 'var(--primary-light)' : 'var(--bg-secondary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '1.2rem' }}>🌇</span><span style={{ fontSize: '0.8rem', fontWeight: '600' }}>Maghrib</span>
                  </button>
                  <button onClick={() => toggleWorship('isya')} className={`worship-btn ${worshipTracker.isya ? 'active' : ''}`} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: worshipTracker.isya ? 'var(--primary-light)' : 'var(--bg-secondary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '1.2rem' }}>🌙</span><span style={{ fontSize: '0.8rem', fontWeight: '600' }}>Isya</span>
                  </button>
                  <button onClick={() => toggleWorship('sunnah')} className={`worship-btn ${worshipTracker.sunnah ? 'active' : ''}`} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: worshipTracker.sunnah ? 'var(--primary-light)' : 'var(--bg-secondary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '1.2rem' }}>✨</span><span style={{ fontSize: '0.8rem', fontWeight: '600' }}>Sunnah</span>
                  </button>
                </div>

                {/* Tilawah Counter */}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>📖 Tilawah Al-Quran</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button onClick={() => incrementTilawah(-1)} style={{ padding: '2px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'transparent', cursor: 'pointer', fontWeight: 'bold' }}>-</button>
                    <span style={{ fontSize: '0.85rem', fontWeight: '700' }}>{worshipTracker.tilawah} Lembar</span>
                    <button onClick={() => incrementTilawah(1)} style={{ padding: '2px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'transparent', cursor: 'pointer', fontWeight: 'bold' }}>+</button>
                  </div>
                </div>
              </div>

              {/* Dzikir Counter (Digital Tasbih) */}
              <div className="mizan-card" style={{ padding: '1.5rem', gap: '1rem', justifyContent: 'center', alignItems: 'center' }}>
                <div className="mizan-card-title" style={{ width: '100%', fontSize: '1.1rem', fontWeight: 'bold', textAlign: 'left' }}>
                  📿 Tasbih Digital
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', margin: '0.5rem 0' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                    Bacaan: {tasbihPhrases[activePhraseIndex]}
                  </span>
                  
                  <div 
                    onClick={incrementTasbih} 
                    style={{
                      width: '90px',
                      height: '90px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--primary-light)',
                      border: '3px solid var(--primary)',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      cursor: 'pointer',
                      boxShadow: 'var(--shadow-md)',
                      userSelect: 'none',
                      transition: 'transform 0.1s active'
                    }}
                  >
                    <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                      {tasbihCount}
                    </span>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                  <button onClick={resetTasbih} className="theme-toggle-btn" style={{ flex: 1, padding: '4px', fontSize: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '8px', justifyContent: 'center' }}>
                    Reset Tasbih
                  </button>
                </div>
              </div>

              {/* Countdown Reminder settings */}
              <div className="mizan-card" style={{ padding: '1.2rem', gap: '0.6rem', alignSelf: isMobile ? 'stretch' : 'start' }}>
                <div className="mizan-card-title" style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Pengaturan Pengingat Adzan</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span>Peringatan sebelum shalat:</span>
                  <select 
                    value={prayerReminderMin} 
                    onChange={(e) => setPrayerReminderMin(parseInt(e.target.value))} 
                    className="form-control" 
                    style={{ padding: '4px', fontSize: '0.8rem', width: '100px' }}
                  >
                    <option value={5}>5 Menit</option>
                    <option value={10}>10 Menit</option>
                    <option value={15}>15 Menit</option>
                    <option value={30}>30 Menit</option>
                  </select>
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: KESEHATAN (v2 - Extended Trackers) */}
          {activeTab === 'health' && (
            <div className="dashboard-grid">
              
              {/* Daily Mood Tracker (New Feature) */}
              <div className="mizan-card" style={{ padding: '1.5rem', gap: '1rem', gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                <div className="mizan-card-title" style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
                  😊 Bagaimana Mood Anda Hari Ini?
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mempengaruhi Mizan Score Anda</span>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', fontSize: '2rem', padding: '0.5rem 0' }}>
                  {['😊', '😐', '😴', '😢', '😰', '💪', '🤲', '🤒'].map(emoji => {
                    const moodLabels = {
                      '😊': 'Senang',
                      '😐': 'Tenang',
                      '😴': 'Lelah',
                      '😢': 'Sedih',
                      '😰': 'Cemas',
                      '💪': 'Semangat',
                      '🤲': 'Bersyukur',
                      '🤒': 'Sakit'
                    };
                    return (
                      <button 
                        key={emoji}
                        type="button"
                        onClick={() => handleMoodSelect(emoji)}
                        style={{
                          background: healthTracker.mood === emoji ? 'var(--primary-light)' : 'transparent',
                          border: healthTracker.mood === emoji ? '2px solid var(--primary)' : '2px solid transparent',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          padding: '6px 10px',
                          fontSize: '1.8rem',
                          flex: '1 0 20%',
                          transition: 'all 0.2s'
                        }}
                        title={moodLabels[emoji] || ''}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Meal log Tracker checklists (New Feature) */}
              <div className="mizan-card" style={{ padding: '1.5rem', gap: '0.8rem' }}>
                <div className="mizan-card-title" style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
                  🥗 Pelacak Makanan Sehat
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Catat porsi makan teratur Anda hari ini</span>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem', marginTop: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={healthTracker.meals?.breakfast || false} 
                      onChange={() => toggleMealTrack('breakfast')}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                    />
                    <span>🍳 Sarapan Pagi</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={healthTracker.meals?.lunch || false} 
                      onChange={() => toggleMealTrack('lunch')}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                    />
                    <span>🍛 Makan Siang</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={healthTracker.meals?.dinner || false} 
                      onChange={() => toggleMealTrack('dinner')}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                    />
                    <span>🍜 Makan Malam</span>
                  </label>
                </div>
              </div>

              {/* Water tracker counter widget */}
              <div className="mizan-card" style={{ padding: '1.5rem', gap: '1rem' }}>
                <div className="mizan-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Asupan Air Minum Harian</span>
                  <span style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--primary)' }}>{healthTracker.water}/8 Gelas</span>
                </div>
                <div className="water-tracker-container" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                  <div className="water-glasses-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', fontSize: '2rem', margin: '0.5rem 0' }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(g => (
                      <span 
                        key={g} 
                        onClick={() => setWaterGlasses(g)} 
                        className={`water-glass ${healthTracker.water >= g ? 'filled' : ''}`}
                        style={{ cursor: 'pointer', filter: healthTracker.water >= g ? 'none' : 'grayscale(100%) opacity(40%)', transition: 'all 0.2s' }}
                      >
                        🥛
                      </span>
                    ))}
                  </div>
                  <button 
                    onClick={() => setWaterGlasses(Math.min(8, healthTracker.water + 1))}
                    className="btn-primary"
                    style={{ padding: '6px 20px', fontSize: '0.85rem' }}
                  >
                    Minum 1 Gelas
                  </button>
                </div>
              </div>

              {/* Sleep log configurations */}
              <div className="mizan-card" style={{ padding: '1.5rem', gap: '0.8rem', alignSelf: isMobile ? 'stretch' : 'start' }}>
                <div className="mizan-card-title" style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Kecukupan Tidur (Anti-Begadang)</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem', margin: '0.5rem 0' }}>
                  <span>Durasi tidur semalam:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input 
                      type="number" 
                      step="0.5" 
                      min="0" 
                      max="24"
                      placeholder="--"
                      value={healthTracker.sleep_hours === null || healthTracker.sleep_hours === undefined ? '' : healthTracker.sleep_hours} 
                      onChange={(e) => handleSleepChange(e.target.value)}
                      className="form-control"
                      style={{ width: '70px', padding: '4px 8px', fontSize: '0.85rem', textAlign: 'center' }}
                    />
                    <span>Jam</span>
                  </div>
                </div>
                {healthTracker.sleep_hours !== '' && healthTracker.sleep_hours !== null && healthTracker.sleep_hours !== undefined ? (
                  parseFloat(healthTracker.sleep_hours) < 7 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: '600', backgroundColor: 'var(--accent-light)', padding: '8px', borderRadius: '6px' }}>
                      ⚠️ Durasi tidur Anda di bawah target minimal 7 jam. Hindari begadang malam ini untuk menjaga stabilitas mental dan fisik!
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: '600', backgroundColor: 'var(--primary-light)', padding: '8px', borderRadius: '6px' }}>
                      ✅ Istirahat Anda tercukupi dengan baik. Pertahankan pola tidur sehat ini!
                    </div>
                  )
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', backgroundColor: 'var(--bg-primary)', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                    Silakan isi durasi tidur Anda untuk melihat analisis istirahat harian.
                  </div>
                )}
              </div>

              {/* Habits checklists */}
              <div className="mizan-card" style={{ padding: '1.5rem', gap: '1rem' }}>
                <div className="mizan-card-title" style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Pelacak Kebiasaan Sehat</div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem', marginTop: '4px' }}>
                  {/* Visual Checkbox Mingguan (Weekly Workouts Tracker) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '4px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>🏋️‍♂️ Target Olahraga Mingguan (Goal: 4x Seminggu):</span>
                    <div style={{ display: 'flex', gap: '14px', fontSize: '2rem', margin: '4px 0' }}>
                      {[1, 2, 3, 4].map(num => (
                        <span
                          key={num}
                          onClick={() => handleWeeklyWorkoutToggle(num)}
                          style={{ cursor: 'pointer', transition: 'transform 0.1s active', transform: 'scale(1)' }}
                          title={`Klik untuk mencatat olahraga ke-${num}`}
                        >
                          {healthTracker.weekly_workouts >= num ? '🟢' : '⚪'}
                        </span>
                      ))}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: healthTracker.weekly_workouts >= 4 ? 'var(--primary)' : 'var(--text-muted)', fontWeight: healthTracker.weekly_workouts >= 4 ? 'bold' : 'normal' }}>
                      {healthTracker.weekly_workouts >= 4 
                        ? '🎉 Keren! Target olahraga mingguan tercapai!' 
                        : `Selesaikan olahraga pilihanmu (joging, sepedaan, workout, stretching) lalu klaim progress.`}
                    </span>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={healthTracker.healthy_food || false} 
                      onChange={() => toggleHealthHabit('healthy_food')}
                      style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                    />
                    <span>🥗 Mengonsumsi Makanan Sehat / Buah-buahan</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={healthTracker.read_book || false} 
                      onChange={() => toggleHealthHabit('read_book')}
                      style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                    />
                    <span>📚 Membaca Buku / Belajar Mandiri (non-kuliah)</span>
                  </label>

                  {/* Inspirasi Gerak Hari Ini */}
                  <div style={{ marginTop: '4px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                    <button 
                      type="button" 
                      onClick={showRandomInspiration} 
                      className="btn-primary" 
                      style={{ width: '100%', padding: '8px 12px', fontSize: '0.8rem', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', boxShadow: 'none' }}
                    >
                      💡 Inspirasi Gerak Hari Ini
                    </button>
                    {inspirationText && (
                      <div className="fade-in" style={{ marginTop: '10px', padding: '10px', borderRadius: '8px', background: 'var(--primary-light)', color: 'var(--text-primary)', fontSize: '0.8rem', borderLeft: '4px solid var(--primary)', lineHeight: '1.4' }}>
                        {inspirationText}
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>

      </div>

      {/* Dynamic bottom navigation tabs (Only visible on Mobile viewports) */}
      {isMobile && (
        <nav className="phone-nav-bar" style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '64px',
          background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.05)',
          zIndex: 999
        }}>
          <button 
            onClick={() => setActiveTab('dashboard')} 
            className={`phone-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', color: activeTab === 'dashboard' ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', gap: '2px', flex: 1 }}
          >
            <span style={{ fontSize: '1.25rem' }}>🏠</span>
            <span style={{ fontSize: '0.65rem', fontWeight: '600' }}>Beranda</span>
          </button>
          <button 
            onClick={() => setActiveTab('finance')} 
            className={`phone-nav-item ${activeTab === 'finance' ? 'active' : ''}`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', color: activeTab === 'finance' ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', gap: '2px', flex: 1 }}
          >
            <span style={{ fontSize: '1.25rem' }}>💸</span>
            <span style={{ fontSize: '0.65rem', fontWeight: '600' }}>Keuangan</span>
          </button>
          <button 
            onClick={() => setActiveTab('islamic')} 
            className={`phone-nav-item ${activeTab === 'islamic' ? 'active' : ''}`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', color: activeTab === 'islamic' ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', gap: '2px', flex: 1 }}
          >
            <span style={{ fontSize: '1.25rem' }}>🕌</span>
            <span style={{ fontSize: '0.65rem', fontWeight: '600' }}>Islami</span>
          </button>
          <button 
            onClick={() => setActiveTab('health')} 
            className={`phone-nav-item ${activeTab === 'health' ? 'active' : ''}`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', color: activeTab === 'health' ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', gap: '2px', flex: 1 }}
          >
            <span style={{ fontSize: '1.25rem' }}>🍏</span>
            <span style={{ fontSize: '0.65rem', fontWeight: '600' }}>Kesehatan</span>
          </button>
        </nav>
      )}

    </div>
  );
}
