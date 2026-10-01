/**
 * Expense & Budget Visualizer — script.js
 * Author: ZafizDev_99
 *
 * Features:
 *  - Add / delete transactions (with confirmation)
 *  - IDR currency formatting (Rp25.000)
 *  - Pie chart via Chart.js
 *  - Monthly Summary
 *  - Sort transactions
 *  - Dark / Light theme toggle (persisted)
 *  - Local Storage persistence
 */

/* ============================================================
   MODULE-LEVEL STATE
   ============================================================ */

/** @type {Array<Object>} Master list of transactions */
let transactions = [];

/** @type {Chart|null} Active Chart.js pie chart instance */
let chartInstance = null;

/* Local Storage keys */
const LS_KEY_TRANSACTIONS = 'transactions';
const LS_KEY_THEME        = 'theme';

/* ============================================================
   DATA MANAGEMENT
   ============================================================ */

/**
 * loadTransactions — reads from localStorage and returns the array.
 * Falls back to an empty array if nothing is stored or JSON is invalid.
 * @returns {Array<Object>}
 */
function loadTransactions() {
  try {
    const raw = localStorage.getItem(LS_KEY_TRANSACTIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    // Corrupted data — start fresh
    return [];
  }
}

/**
 * saveTransactions — serialises the current transactions array to localStorage.
 */
function saveTransactions() {
  localStorage.setItem(LS_KEY_TRANSACTIONS, JSON.stringify(transactions));
}

/* ============================================================
   CURRENCY FORMATTING
   ============================================================ */

/**
 * formatCurrency — converts a numeric amount to IDR string.
 * Uses dots as thousands separators; never shows decimals.
 *
 * @param {number} amount
 * @returns {string}  e.g. 25000 → "Rp25.000", 1250000 → "Rp1.250.000"
 */
function formatCurrency(amount) {
  const rounded = Math.round(amount);
  // toLocaleString with 'id-ID' locale uses dots for thousands separators
  const formatted = rounded.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  return 'Rp' + formatted;
}

/* ============================================================
   NOTIFICATION
   ============================================================ */

/**
 * showNotification — displays a temporary toast message.
 * Auto-hides after 3 000 ms.
 *
 * @param {string} message
 * @param {'success'|'error'} type
 */
function showNotification(message, type = 'success') {
  const el = document.getElementById('notification');
  if (!el) return;

  // Reset any running timer
  clearTimeout(el._hideTimer);

  el.textContent = message;
  el.className = 'notification show' + (type === 'error' ? ' error' : '');

  el._hideTimer = setTimeout(() => {
    el.className = 'notification'; // triggers CSS fade-out
  }, 3000);
}

/* ============================================================
   THEME
   ============================================================ */

/**
 * toggleTheme — switches between 'light' and 'dark' data-theme,
 * updates the toggle button label, and persists the choice.
 */
function toggleTheme() {
  const root   = document.documentElement;
  const btn    = document.getElementById('themeToggle');
  const isDark = root.getAttribute('data-theme') === 'dark';

  const newTheme = isDark ? 'light' : 'dark';
  root.setAttribute('data-theme', newTheme);
  localStorage.setItem(LS_KEY_THEME, newTheme);

  if (btn) {
    btn.textContent = newTheme === 'dark' ? '☀️ Light' : '🌙 Dark';
  }
}

/**
 * restoreTheme — called at startup to apply saved theme before
 * the DOM paints (avoids flicker).
 */
function restoreTheme() {
  const saved = localStorage.getItem(LS_KEY_THEME);
  const btn   = document.getElementById('themeToggle');

  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    if (btn) btn.textContent = '☀️ Light';
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    if (btn) btn.textContent = '🌙 Dark';
  }
}

/* ============================================================
   ADD TRANSACTION
   ============================================================ */

/**
 * addTransaction — handles the form submit event.
 * Validates inputs, creates a transaction object, saves, and updates UI.
 *
 * @param {Event} event
 */
function addTransaction(event) {
  event.preventDefault();

  const nameInput     = document.getElementById('itemName');
  const amountInput   = document.getElementById('itemAmount');
  const categoryInput = document.getElementById('itemCategory');
  const errorEl       = document.getElementById('formError');

  const name     = nameInput.value.trim();
  const amount   = parseFloat(amountInput.value);
  const category = categoryInput.value;

  // --- Validation ---
  const showError = (msg) => {
    errorEl.textContent = msg;
    errorEl.classList.add('visible');
  };

  errorEl.classList.remove('visible');
  errorEl.textContent = '';

  if (!name) {
    showError('Item name cannot be empty.');
    nameInput.focus();
    return;
  }

  if (isNaN(amount) || amount <= 0) {
    showError('Amount must be greater than 0.');
    amountInput.focus();
    return;
  }

  if (!['Food', 'Transport', 'Fun'].includes(category)) {
    showError('Please select a category.');
    categoryInput.focus();
    return;
  }

  // --- Build transaction object ---
  /** @type {{id:number, name:string, amount:number, category:string, date:string}} */
  const transaction = {
    id:       Date.now(),
    name:     name,
    amount:   amount,
    category: category,
    date:     new Date().toISOString()
  };

  // --- Persist and update ---
  transactions.push(transaction);
  saveTransactions();
  renderTransactions();
  calculateTotal();
  updateChart();
  updateMonthlySummary();
  showNotification('Transaction added successfully.', 'success');

  // Reset form
  event.target.reset();
  errorEl.classList.remove('visible');
}

/* ============================================================
   DELETE TRANSACTION
   ============================================================ */

/**
 * deleteTransaction — removes a transaction by id after confirmation.
 *
 * @param {number} id  The transaction's unique id
 */
function deleteTransaction(id) {
  const confirmed = confirm('Are you sure you want to delete this transaction?');
  if (!confirmed) return;

  transactions = transactions.filter(t => t.id !== id);
  saveTransactions();
  renderTransactions();
  calculateTotal();
  updateChart();
  updateMonthlySummary();
  showNotification('Transaction deleted.', 'success');
}

/* ============================================================
   SORTING
   ============================================================ */

/**
 * sortTransactions — returns a sorted COPY of the transactions array
 * based on the current value of #sortSelect.
 * Does NOT mutate the original array.
 *
 * @returns {Array<Object>}
 */
function sortTransactions() {
  const sortEl = document.getElementById('sortSelect');
  const mode   = sortEl ? sortEl.value : 'newest';
  const copy   = [...transactions];

  switch (mode) {
    case 'newest':
      return copy.sort((a, b) => new Date(b.date) - new Date(a.date));
    case 'oldest':
      return copy.sort((a, b) => new Date(a.date) - new Date(b.date));
    case 'highest':
      return copy.sort((a, b) => b.amount - a.amount);
    case 'lowest':
      return copy.sort((a, b) => a.amount - b.amount);
    case 'category':
      return copy.sort((a, b) => a.category.localeCompare(b.category));
    default:
      return copy;
  }
}

/* ============================================================
   RENDER TRANSACTIONS
   ============================================================ */

/**
 * renderTransactions — builds and injects transaction list HTML.
 * Shows emptyState div when there are no transactions.
 */
function renderTransactions() {
  const listEl      = document.getElementById('transactionList');
  const emptyEl     = document.getElementById('emptyState');
  if (!listEl || !emptyEl) return;

  if (transactions.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';

  const sorted = sortTransactions();

  listEl.innerHTML = sorted.map(t => {
    const dateObj = new Date(t.date);
    // Format: "01 October 2026, 12:30"
    const dateStr = dateObj.toLocaleDateString('en-GB', {
      day:   '2-digit',
      month: 'long',
      year:  'numeric'
    });
    const timeStr = dateObj.toLocaleTimeString('en-GB', {
      hour:   '2-digit',
      minute: '2-digit'
    });

    return `
      <div class="transaction-item" data-id="${t.id}">
        <div class="transaction-info">
          <p class="transaction-name">${escapeHTML(t.name)}</p>
          <div class="transaction-meta">
            <span class="category-badge ${escapeHTML(t.category)}">${escapeHTML(t.category)}</span>
            <span class="transaction-date">${dateStr}, ${timeStr}</span>
          </div>
        </div>
        <div class="transaction-right">
          <span class="transaction-amount">${formatCurrency(t.amount)}</span>
          <button
            class="btn-delete"
            onclick="deleteTransaction(${t.id})"
            aria-label="Delete transaction: ${escapeHTML(t.name)}"
          >Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

/* ============================================================
   CALCULATE TOTAL
   ============================================================ */

/**
 * calculateTotal — sums all transaction amounts and updates #totalAmount.
 */
function calculateTotal() {
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  const el = document.getElementById('totalAmount');
  if (el) el.textContent = formatCurrency(total);
}

/* ============================================================
   PIE CHART
   ============================================================ */

/**
 * updateChart — (re)creates the Chart.js pie chart.
 * Destroys the previous instance before creating a new one.
 * Shows/hides the empty-state message as needed.
 */
function updateChart() {
  const canvas   = document.getElementById('expenseChart');
  const emptyEl  = document.getElementById('chartEmptyState');
  if (!canvas || !emptyEl) return;

  // Aggregate amounts per category
  const totals = { Food: 0, Transport: 0, Fun: 0 };
  transactions.forEach(t => {
    if (totals.hasOwnProperty(t.category)) {
      totals[t.category] += t.amount;
    }
  });

  const hasData = Object.values(totals).some(v => v > 0);

  // Show/hide empty state
  if (!hasData) {
    canvas.style.display     = 'none';
    emptyEl.style.display    = 'block';

    // Destroy leftover chart if any
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  canvas.style.display  = 'block';
  emptyEl.style.display = 'none';

  // Destroy previous instance to avoid "canvas already in use" error
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const ctx = canvas.getContext('2d');

  chartInstance = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Food', 'Transport', 'Fun'],
      datasets: [{
        data: [totals.Food, totals.Transport, totals.Fun],
        backgroundColor: [
          '#10b981', // Food   — green
          '#4f46e5', // Transport — indigo
          '#f59e0b'  // Fun    — amber
        ],
        borderWidth: 2,
        borderColor: 'transparent',
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 16,
            font: { family: 'Inter', size: 12, weight: '500' },
            // Use the current text colour dynamically
            color: getComputedStyle(document.documentElement)
                     .getPropertyValue('--text-secondary').trim() || '#4a5568'
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label  = context.label || '';
              const value  = context.parsed;
              const total  = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
              const pct    = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
              return ` ${label}: ${formatCurrency(value)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

/* ============================================================
   MONTHLY SUMMARY
   ============================================================ */

/**
 * updateMonthlySummary — computes stats for the current calendar month
 * and writes them to the #summary* elements.
 */
function updateMonthlySummary() {
  const now          = new Date();
  const currentMonth = now.getMonth();
  const currentYear  = now.getFullYear();

  // Filter to current month & year
  const monthly = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  // Month label e.g. "October 2026"
  const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // Totals
  const total = monthly.reduce((sum, t) => sum + t.amount, 0);
  const count = monthly.length;
  const avg   = count > 0 ? total / count : 0;

  // Top category (by total amount)
  const categoryTotals = { Food: 0, Transport: 0, Fun: 0 };
  monthly.forEach(t => {
    if (categoryTotals.hasOwnProperty(t.category)) {
      categoryTotals[t.category] += t.amount;
    }
  });

  let topCategory = '—';
  if (count > 0) {
    topCategory = Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])[0][0];
  }

  // Update DOM
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  set('summaryMonth',       monthLabel);
  set('summaryTotal',       formatCurrency(total));
  set('summaryCount',       String(count));
  set('summaryTopCategory', topCategory);
  set('summaryAverage',     count > 0 ? formatCurrency(avg) : 'Rp0');
}

/* ============================================================
   UTILITY
   ============================================================ */

/**
 * escapeHTML — prevents XSS by escaping user-provided strings
 * before inserting them into innerHTML.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/* ============================================================
   INITIALISATION
   ============================================================ */

/**
 * init — bootstraps the app on DOMContentLoaded.
 *  1. Restore theme (before any paint)
 *  2. Load and render persisted data
 *  3. Wire up event listeners
 */
function init() {
  // 1. Theme first to avoid flash
  restoreTheme();

  // 2. Load data and render everything
  transactions = loadTransactions();
  renderTransactions();
  calculateTotal();
  updateChart();
  updateMonthlySummary();

  // 3. Event listeners
  const form = document.getElementById('transactionForm');
  if (form) form.addEventListener('submit', addTransaction);

  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) sortSelect.addEventListener('change', renderTransactions);
}

/* ============================================================
   ENTRY POINT
   ============================================================ */
document.addEventListener('DOMContentLoaded', init);
