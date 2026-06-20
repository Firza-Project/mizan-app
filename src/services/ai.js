// AI Engine Service - Mizan App
// Implements core business logic, formulas, and mock AI suggestions

import { db, secureRandom } from './db';

export const CATEGORY_TO_SYARIAH_MAP = {
  // Dharuriyat
  makanan_pokok: { priority: 'Dharuriyat', label: 'Makanan Pokok', group: 'Kebutuhan Pokok' },
  kos_tempat_tinggal: { priority: 'Dharuriyat', label: 'Kos / Tempat Tinggal', group: 'Kebutuhan Pokok' },
  spp_ukt: { priority: 'Dharuriyat', label: 'SPP / UKT Kuliah', group: 'Akademik' },
  transportasi_kuliah: { priority: 'Dharuriyat', label: 'Transportasi Kuliah', group: 'Kebutuhan Pokok' },

  // Hajiyat
  buku_kuliah: { priority: 'Hajiyat', label: 'Buku & Referensi Kuliah', group: 'Akademik' },
  paket_internet: { priority: 'Hajiyat', label: 'Paket Internet Belajar', group: 'Akademik' },
  alat_tulis: { priority: 'Hajiyat', label: 'Alat Tulis & Kuliah', group: 'Akademik' },
  sedekah: { priority: 'Hajiyat', label: 'Sedekah & Zakat', group: 'Saving & Sedekah' },

  // Tahsiniyat
  kopi_cafe: { priority: 'Tahsiniyat', label: 'Kopi & Nongkrong Kafe', group: 'Gaya Hidup' },
  hiburan: { priority: 'Tahsiniyat', label: 'Hiburan & Game', group: 'Gaya Hidup' },
  fashion: { priority: 'Tahsiniyat', label: 'Pakaian & Mode', group: 'Gaya Hidup' },
  streaming: { priority: 'Tahsiniyat', label: 'Langganan Streaming', group: 'Gaya Hidup' },
  hangout: { priority: 'Tahsiniyat', label: 'Hangout & Restoran', group: 'Gaya Hidup' },
  lainnya: { priority: 'Tahsiniyat', label: 'Lain-lain', group: 'Gaya Hidup' }
};

// Auto Classify Transaction
export const classifyTransaction = (category) => {
  const mapping = CATEGORY_TO_SYARIAH_MAP[category];
  if (mapping) {
    return {
      category,
      priority_tag: mapping.priority,
      pos_utama: mapping.group,
      label: mapping.label
    };
  }
  return {
    category,
    priority_tag: 'Tahsiniyat',
    pos_utama: 'Gaya Hidup',
    label: 'Lain-lain'
  };
};

// Calculate financial metrics for a user
export const calculateFinancials = (userId, transactions, budgetPlan) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  // Filter transactions for this month
  const thisMonthTransactions = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  });

  // Calculate Income
  const totalIncome = thisMonthTransactions
    .filter(t => t.transaction_type === 'Masuk')
    .reduce((sum, t) => sum + t.amount, 0);

  // Fallback to monthly budget if no income registered
  const incomeReference = totalIncome > 0 ? totalIncome : (budgetPlan ? budgetPlan.monthly_budget : 2000000);

  // Expenses by priority_tag
  const expenses = thisMonthTransactions.filter(t => t.transaction_type === 'Keluar');
  const totalExpense = expenses.reduce((sum, t) => sum + t.amount, 0);

  const dharuriyatSpend = expenses.filter(t => t.priority_tag === 'Dharuriyat').reduce((sum, t) => sum + t.amount, 0);
  const hajiyatSpend = expenses.filter(t => t.priority_tag === 'Hajiyat' && t.category !== 'sedekah').reduce((sum, t) => sum + t.amount, 0);
  const tahsiniyatSpend = expenses.filter(t => t.priority_tag === 'Tahsiniyat').reduce((sum, t) => sum + t.amount, 0);
  const sedekahSpend = expenses.filter(t => t.category === 'sedekah').reduce((sum, t) => sum + t.amount, 0);

  // Balance (all time)
  const allTimeTransactions = transactions;
  const totalAllTimeIncome = allTimeTransactions
    .filter(t => t.transaction_type === 'Masuk')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalAllTimeExpense = allTimeTransactions
    .filter(t => t.transaction_type === 'Keluar')
    .reduce((sum, t) => sum + t.amount, 0);
  const currentBalance = totalAllTimeIncome - totalAllTimeExpense;

  // Savings this month
  const savings = Math.max(0, incomeReference - totalExpense);
  const savingsPercent = incomeReference > 0 ? (savings / incomeReference) * 100 : 0;

  return {
    totalIncome,
    incomeReference,
    totalExpense,
    dharuriyatSpend,
    hajiyatSpend,
    tahsiniyatSpend,
    sedekahSpend,
    currentBalance,
    savings,
    savingsPercent,
    thisMonthTransactions
  };
};

// FR-03: Calculate Financial Health Score
export const calculateHealthScore = (userId) => {
  const transactions = db.transactions.list(userId);
  const budgetPlan = db.budgets.get(userId);

  if (transactions.length === 0) {
    return { score: 0, status: 'PERLU_SELARAS', breakdown: { savings: 0, compliance: 0, israf: 0 } };
  }

  const activeBudget = budgetPlan || {
    monthly_budget: 2000000,
    allocation_ratio: { dharuriyat: 50, hajiyat: 20, tahsiniyat: 10, saving: 20 },
    limit_alert: 600000
  };

  const {
    incomeReference,
    dharuriyatSpend,
    tahsiniyatSpend,
    hajiyatSpend,
    sedekahSpend,
    savingsPercent,
    savings
  } = calculateFinancials(userId, transactions, activeBudget);

  // Component A: Savings Percent (ideal target >= 20%)
  const componentA = Math.min(100, (savingsPercent / 20) * 100);

  // Component B: Budget Compliance 50/30/20
  // Target: Dharuriyat 50%, Flex (Hajiyat+Tahsiniyat) 30%, Saving+Sedekah 20%
  const idealDharuriyat = incomeReference * 0.50;
  const idealFlex = incomeReference * 0.30;
  const idealSavingSedekah = incomeReference * 0.20;

  const actualFlex = hajiyatSpend + tahsiniyatSpend;
  const actualSavingSedekah = savings + sedekahSpend;

  // Deviations deduct points
  const dharuriyatDev = dharuriyatSpend > idealDharuriyat 
    ? Math.max(0, 100 - ((dharuriyatSpend - idealDharuriyat) / idealDharuriyat) * 100)
    : 100;

  const flexDev = actualFlex > idealFlex
    ? Math.max(0, 100 - ((actualFlex - idealFlex) / idealFlex) * 100)
    : 100;

  const savingSedekahDev = actualSavingSedekah >= idealSavingSedekah
    ? 100
    : (actualSavingSedekah / idealSavingSedekah) * 100;

  const componentB = (dharuriyatDev + flexDev + savingSedekahDev) / 3;

  // Component C: Israf Score
  // Calculation: Start with 100. Deduct points for weekly overspending
  const weeklyTahsiniyatLimit = (activeBudget.monthly_budget * 0.30) / 4;
  
  // Group Tahsiniyat spends by week of the month
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const thisMonthTahsiniyats = transactions.filter(t => {
    const d = new Date(t.date);
    return t.transaction_type === 'Keluar' && 
           t.priority_tag === 'Tahsiniyat' && 
           d.getFullYear() === currentYear && 
           d.getMonth() === currentMonth;
  });

  const weeklySpends = [0, 0, 0, 0, 0]; // 5 weeks max
  thisMonthTahsiniyats.forEach(t => {
    const d = new Date(t.date);
    const day = d.getDate();
    const weekIdx = Math.min(4, Math.floor((day - 1) / 7));
    weeklySpends[weekIdx] += t.amount;
  });

  let israfDeductions = 0;
  weeklySpends.forEach(spend => {
    if (spend > weeklyTahsiniyatLimit) {
      // Overspent! Deduct relative to how much we overspent
      const excessRatio = (spend - weeklyTahsiniyatLimit) / weeklyTahsiniyatLimit;
      israfDeductions += Math.min(25, excessRatio * 20); // cap deduction at 25 points per week
    }
  });

  const componentC = Math.max(0, 100 - israfDeductions);

  // Final Health Score
  const score = (0.40 * componentA) + (0.40 * componentB) + (0.20 * componentC);
  const roundedScore = Math.round(score * 10) / 10;

  let status = 'SEHAT';
  if (roundedScore < 50) {
    status = 'KRITIS';
  } else if (roundedScore < 70) {
    status = 'PERLU_PERHATIAN';
  }

  return {
    score: roundedScore,
    status,
    breakdown: {
      savings: Math.round(componentA),
      compliance: Math.round(componentB),
      israf: Math.round(componentC)
    }
  };
};

// FR-05: Israf Detection Engine
export const detectIsraf = (userId, pendingAmount, category) => {
  const transactions = db.transactions.list(userId);
  const budgetPlan = db.budgets.get(userId);

  if (!budgetPlan) return { israf: false, message: '' };

  const mapping = classifyTransaction(category);
  if (mapping.priority_tag !== 'Tahsiniyat') {
    return { israf: false, message: '' }; // Only Tahsiniyat can trigger Israf
  }

  const monthlyTahsiniyatLimit = budgetPlan.monthly_budget * 0.30;
  const weeklyTahsiniyatLimit = monthlyTahsiniyatLimit / 4;

  // Calculate current week spending
  const now = new Date();
  const startOfWeek = new Date();
  startOfWeek.setDate(now.getDate() - now.getDay()); // Start of this week (Sunday)
  startOfWeek.setHours(0, 0, 0, 0);

  const thisWeekTahsiniyatSpend = transactions
    .filter(t => {
      const d = new Date(t.date);
      return t.transaction_type === 'Keluar' && 
             t.priority_tag === 'Tahsiniyat' && 
             d >= startOfWeek;
    })
    .reduce((sum, t) => sum + t.amount, 0);

  const totalProposed = thisWeekTahsiniyatSpend + parseFloat(pendingAmount);

  if (totalProposed > weeklyTahsiniyatLimit) {
    const limitFormatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(weeklyTahsiniyatLimit);
    const excessFormatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(totalProposed - weeklyTahsiniyatLimit);
    
    return {
      israf: true,
      message: `Peringatan Israf! Transaksi ini akan melebihi batas pengeluaran Gaya Hidup mingguan Anda sebesar ${limitFormatted} (Kelebihan: ${excessFormatted}). Pikirkan kembali sebelum berbelanja!`
    };
  }

  // Monthly check
  const currentMonthSpends = transactions
    .filter(t => {
      const d = new Date(t.date);
      return t.transaction_type === 'Keluar' && 
             t.priority_tag === 'Tahsiniyat' && 
             d.getMonth() === now.getMonth() && 
             d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, t) => sum + t.amount, 0);

  if (currentMonthSpends + parseFloat(pendingAmount) > monthlyTahsiniyatLimit) {
    return {
      israf: true,
      message: `Peringatan Israf Bulanan! Total pengeluaran Gaya Hidup bulan ini diprediksi melebihi batas aman 30% dari total anggaran.`
    };
  }

  return { israf: false, message: '' };
};

// FR-06: Predictive Analytics & Balance Forecasting (28-day rolling window)
export const predictBalanceDepletion = (userId) => {
  const transactions = db.transactions.list(userId);
  const budgetPlan = db.budgets.get(userId);

  if (!budgetPlan || transactions.length === 0) {
    return {
      days_until_empty: null,
      depletion_date: null,
      avg_daily_expense: 0,
      current_balance: 0
    };
  }

  const { currentBalance } = calculateFinancials(userId, transactions, budgetPlan);

  // Filter last 28 days of transactions
  const now = new Date();
  const cutoffDate = new Date();
  cutoffDate.setDate(now.getDate() - 28);

  const last28DaysExpenses = transactions.filter(t => {
    const d = new Date(t.date);
    return t.transaction_type === 'Keluar' && d >= cutoffDate;
  });

  const totalExpense28d = last28DaysExpenses.reduce((sum, t) => sum + t.amount, 0);
  const avgDailyExpense = totalExpense28d / 28;

  if (avgDailyExpense <= 0) {
    return {
      days_until_empty: 999, // infinite / safe
      depletion_date: 'Sangat Aman',
      avg_daily_expense: 0,
      current_balance: currentBalance
    };
  }

  const daysUntilEmpty = currentBalance / avgDailyExpense;
  const depletionDate = new Date();
  depletionDate.setDate(now.getDate() + Math.round(daysUntilEmpty));

  const formattedDate = depletionDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  return {
    days_until_empty: Math.round(daysUntilEmpty * 10) / 10,
    depletion_date: formattedDate,
    avg_daily_expense: Math.round(avgDailyExpense),
    current_balance: currentBalance
  };
};

// FR-07: Smart Recommendations Engine (Dev >15% warning)
export const generateRecommendations = (userId) => {
  const transactions = db.transactions.list(userId);
  const budgetPlan = db.budgets.get(userId);

  if (!budgetPlan || transactions.length < 2) return [];

  const now = new Date();
  const startOfThisWeek = new Date();
  startOfThisWeek.setDate(now.getDate() - 7);

  const startOfLastWeek = new Date();
  startOfLastWeek.setDate(now.getDate() - 14);

  // This week Tahsiniyat spend
  const thisWeekTahsiniyat = transactions.filter(t => {
    const d = new Date(t.date);
    return t.transaction_type === 'Keluar' && t.priority_tag === 'Tahsiniyat' && d >= startOfThisWeek;
  });

  const thisWeekTotal = thisWeekTahsiniyat.reduce((sum, t) => sum + t.amount, 0);

  // Last week Tahsiniyat spend
  const lastWeekTahsiniyat = transactions.filter(t => {
    const d = new Date(t.date);
    return t.transaction_type === 'Keluar' && t.priority_tag === 'Tahsiniyat' && d >= startOfLastWeek && d < startOfThisWeek;
  });

  const lastWeekTotal = lastWeekTahsiniyat.reduce((sum, t) => sum + t.amount, 0);

  const recommendations = [];

  // Critical health score recommendation
  const health = calculateHealthScore(userId);
  if (health.score < 50) {
    recommendations.push({
      type: 'HEALTH_CRITICAL',
      title: '🚨 Panduan AI Darurat Finansial',
      message: 'Status keuangan Anda KRITIS. Untuk memulihkan saldo Anda, bekukan semua pengeluaran Gaya Hidup (Tahsiniyat) selama 2 minggu ke depan. Fokus hanya pada kebutuhan pokok (Dharuriyat) dan studi.',
      severity: 'high'
    });
  }

  // Deviation recommendation
  if (lastWeekTotal > 0) {
    const deviation = (thisWeekTotal - lastWeekTotal) / lastWeekTotal;
    if (deviation > 0.15) {
      // Find most expensive sub-category this week
      const spendsByCategory = {};
      thisWeekTahsiniyat.forEach(t => {
        spendsByCategory[t.category] = (spendsByCategory[t.category] || 0) + t.amount;
      });

      let topCategory = 'kopi_cafe';
      let maxAmount = 0;
      Object.keys(spendsByCategory).forEach(cat => {
        if (spendsByCategory[cat] > maxAmount) {
          maxAmount = spendsByCategory[cat];
          topCategory = cat;
        }
      });

      const excessAmount = thisWeekTotal - lastWeekTotal;
      const categoryLabel = CATEGORY_TO_SYARIAH_MAP[topCategory]?.label || 'Gaya Hidup';
      const formattedExcess = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(excessAmount);

      recommendations.push({
        type: 'SPENDING_SPIKE',
        title: '☕ Rekomendasi Hemat AI',
        message: `Pengeluaran non-primer Anda melonjak ${Math.round(deviation * 100)}% dibanding minggu lalu. Kurangi budget ${categoryLabel} minggu ini sebesar ${formattedExcess} agar dana Anda aman sampai akhir bulan.`,
        severity: 'medium'
      });
    }
  }

  // Savings advice
  const { savingsPercent } = calculateFinancials(userId, transactions, budgetPlan);
  if (savingsPercent < 20) {
    recommendations.push({
      type: 'SAVINGS_LOW',
      title: '🌱 Rekomendasi Keberkahan Finansial',
      message: `Persentase tabungan Anda (${Math.round(savingsPercent)}%) masih di bawah target ideal 20%. Cobalah untuk menyisihkan Rp 10.000 setiap hari di awal kiriman orang tua sebelum dibelanjakan untuk hal komplementer.`,
      severity: 'low'
    });
  }

  return recommendations;
};

// FR-08: Weekly Reflection Report
export const generateWeeklyReflection = (userId) => {
  const transactions = db.transactions.list(userId);
  const budgetPlan = db.budgets.get(userId);

  if (!budgetPlan) return null;

  const now = new Date();
  const startOfThisWeek = new Date();
  startOfThisWeek.setDate(now.getDate() - 7);

  // This week transactions
  const thisWeekTxs = transactions.filter(t => new Date(t.date) >= startOfThisWeek);
  
  const income = thisWeekTxs.filter(t => t.transaction_type === 'Masuk').reduce((sum, t) => sum + t.amount, 0);
  const expense = thisWeekTxs.filter(t => t.transaction_type === 'Keluar').reduce((sum, t) => sum + t.amount, 0);

  // Most expensive category
  const expensesByCategory = {};
  thisWeekTxs.filter(t => t.transaction_type === 'Keluar').forEach(t => {
    expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount;
  });

  let topCategory = null;
  let maxAmount = 0;
  Object.keys(expensesByCategory).forEach(cat => {
    if (expensesByCategory[cat] > maxAmount) {
      maxAmount = expensesByCategory[cat];
      topCategory = cat;
    }
  });

  const topCategoryLabel = topCategory ? (CATEGORY_TO_SYARIAH_MAP[topCategory]?.label || topCategory) : 'Tidak ada pengeluaran';

  // 50/30/20 Compliance
  const compliance = calculateHealthScore(userId).breakdown.compliance || 100;
  const israfScore = calculateHealthScore(userId).breakdown.israf || 100;

  const quotes = [
    {
      text: '"Dan janganlah kamu jadikan tanganmu terbelenggu pada lehermu dan janganlah kamu terlalu mengulurkannya, nanti kamu menjadi tercela dan menyesal."',
      ref: 'QS. Al-Isra: 29'
    },
    {
      text: '"Dan orang-orang yang apabila membelanjakan (harta), mereka tidak berlebih-lebihan dan tidak (pula) kikir, dan adalah (pembelanjaan itu) di tengah-tengah antara yang demikian."',
      ref: 'QS. Al-Furqan: 67'
    },
    {
      text: '"Makan dan minumlah, tetapi jangan berlebih-lebihan. Sesungguhnya Allah tidak menyukai orang-orang yang berlebih-lebihan."',
      ref: 'QS. Al-A\'raf: 31'
    }
  ];

  const randomQuote = quotes[Math.floor(secureRandom() * quotes.length)];

  return {
    income,
    expense,
    topCategoryLabel,
    topCategoryAmount: maxAmount,
    compliance,
    israfScore,
    quote: randomQuote
  };
};

export const calculateMizanScore = (userId) => {
  // 1. Get Financial Score
  const finScoreData = calculateHealthScore(userId);
  const finScore = finScoreData.score;

  // 2. Get Worship Score (average of the last 7 days)
  let worshipSum = 0;
  let worshipLoggedDays = 0;
  const dates = [];
  const now = new Date();
  
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    dates.push(dateStr);
  }

  dates.forEach(date => {
    const w = db.worship.get(userId, date);
    if (!w.hasData) return;
    worshipLoggedDays++;
    let dayScore = 0;
    
    // Check checklist shalat wajib (5 shalat * 15 points = 75 points)
    if (w.subuh) dayScore += 15;
    if (w.dzuhur) dayScore += 15;
    if (w.ashar) dayScore += 15;
    if (w.maghrib) dayScore += 15;
    if (w.isya) dayScore += 15;
    
    // Shalat sunnah (10 points)
    if (w.sunnah) dayScore += 10;
    
    // Tilawah Al-Quran (ideal >= 1 page, i.e., 15 points)
    if (w.tilawah >= 1) dayScore += 15;
    
    worshipSum += dayScore;
  });
  
  const worshipScore = worshipLoggedDays > 0 ? Math.round(worshipSum / worshipLoggedDays) : 0;

  // 3. Get Health Score (average of the last 7 days)
  let healthSum = 0;
  let healthLoggedDays = 0;
  dates.forEach(date => {
    const h = db.health.get(userId, date);
    if (!h.hasData) return;
    healthLoggedDays++;
    let dayScore = 0;
    
    // Water (target 8 glasses * 5 points = 40 points)
    dayScore += Math.min(40, h.water * 5);
    
    // Sleep (target 7 hours = 30 points, deduct if less than 6 hours)
    if (h.sleep_hours >= 7) {
      dayScore += 30;
    } else if (h.sleep_hours >= 6) {
      dayScore += 20;
    } else {
      dayScore += 10;
    }
    
    // Healthy habits checklist (exercise + healthy_food + read_book = 3 items * 10 points = 30 points)
    if (h.exercise) dayScore += 10;
    if (h.healthy_food) dayScore += 10;
    if (h.read_book) dayScore += 10;
    
    healthSum += dayScore;
  });
  
  const healthScore = healthLoggedDays > 0 ? Math.round(healthSum / healthLoggedDays) : 0;

  // 4. Calculate Unified Mizan Score
  // Formula: 40% Finance + 30% Worship + 30% Health
  const mizanScore = Math.round((0.40 * finScore) + (0.30 * worshipScore) + (0.30 * healthScore));

  // 5. Generate Personal recommendations
  const recs = [];
  
  if (finScore < 70) {
    recs.push({
      type: 'FINANCE',
      title: '💼 Saran Finansial',
      message: 'Skor keuangan Anda masih perlu perhatian. Kurangi pengeluaran gaya hidup (Tahsiniyat) dan alokasikan minimal 20% untuk tabungan.'
    });
  }
  
  if (worshipScore < 80) {
    recs.push({
      type: 'WORSHIP',
      title: '🕌 Saran Ibadah',
      message: 'Jaga konsistensi shalat wajib 5 waktu dan cobalah merutinkan tilawah Al-Quran minimal 1 lembar setelah shalat.'
    });
  }
  
  if (healthScore < 80) {
    recs.push({
      type: 'HEALTH',
      title: '🍏 Saran Kesehatan',
      message: 'Pastikan minum minimal 8 gelas air setiap hari dan tidurlah cukup (7-8 jam) dengan menghindari begadang.'
    });
  }

  // Fallback recommendation if everything is good
  if (recs.length === 0) {
    recs.push({
      type: 'EXCELLENT',
      title: '🌟 Keseimbangan Prima',
      message: 'MasyaAllah! Anda berhasil menjaga keseimbangan hidup yang sangat baik antara finansial, ibadah, dan kesehatan. Pertahankan!'
    });
  }

  return {
    score: mizanScore,
    financial: finScore,
    worship: worshipScore,
    health: healthScore,
    recommendations: recs
  };
};
