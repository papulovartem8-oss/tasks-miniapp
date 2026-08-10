const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const DEMO_MODE = !tg?.CloudStorage;

const splash = document.getElementById('splash');
setTimeout(() => {
    splash.classList.add('splash--hide');
    setTimeout(() => splash.remove(), 600);
}, 2200);

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];
const MONTHS_SHORT = [
    'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'
];

let selectedDate = new Date();
let calendarOffset = 0;
let tasks = [];
let isSheetOpen = false;
let idCounter = Date.now();
let newTaskPriority = 0;
let newTaskDeadline = null;
let pendingDeadlines = [];
let editingTask = null;

const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const loading = document.getElementById('loading');
const headerDate = document.getElementById('headerDate');
const statsDone = document.getElementById('statsDone');
const statsTotal = document.getElementById('statsTotal');
const calendarStrip = document.getElementById('calendarStrip');
const calLeft = document.getElementById('calLeft');
const calRight = document.getElementById('calRight');
const fabBtn = document.getElementById('fabBtn');
const addSheet = document.getElementById('addSheet');
const sheetOverlay = document.getElementById('sheetOverlay');
const taskInput = document.getElementById('taskInput');
const sendBtn = document.getElementById('sendBtn');
const priorityBtn = document.getElementById('priorityBtn');
const deadlineBtn = document.getElementById('deadlineBtn');
const deadlineRow = document.getElementById('deadlineRow');
const deadlineInput = document.getElementById('deadlineInput');
const deadlineClear = document.getElementById('deadlineClear');
const sheetClose = document.getElementById('sheetClose');

renderCalendar();
loadTasks();
setupMainButton();

calLeft.addEventListener('click', () => { calendarOffset -= 7; renderCalendar(); });
calRight.addEventListener('click', () => { calendarOffset += 7; renderCalendar(); });
fabBtn.addEventListener('click', () => { isSheetOpen ? closeSheet() : openSheet(); });
sheetOverlay.addEventListener('click', closeSheet);
sheetClose.addEventListener('click', closeSheet);
taskInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });
sendBtn.addEventListener('click', addTask);
deadlineInput.addEventListener('click', (e) => e.stopPropagation());
deadlineInput.addEventListener('focus', (e) => e.stopPropagation());
priorityBtn.addEventListener('click', togglePriority);
deadlineBtn.addEventListener('click', toggleDeadlinePicker);
deadlineClear.addEventListener('click', clearDeadline);
deadlineInput.addEventListener('change', onDeadlineChange);

function togglePriority() {
    newTaskPriority = (newTaskPriority + 1) % 3;
    priorityBtn.classList.remove('sheet__priority--medium', 'sheet__priority--active');
    if (newTaskPriority === 1) priorityBtn.classList.add('sheet__priority--medium');
    if (newTaskPriority === 2) priorityBtn.classList.add('sheet__priority--active');
    haptic('impact', 'light');
}

function taskPriority(task) {
    if (task.priority !== undefined) return task.priority;
    if (task.important) return 2;
    return 0;
}

function toggleDeadlinePicker() {
    const isVisible = deadlineRow.classList.contains('sheet__deadline-row--visible');
    if (isVisible) {
        clearDeadline();
    } else {
        deadlineRow.classList.add('sheet__deadline-row--visible');
        deadlineBtn.classList.add('sheet__deadline-btn--active');
        const now = new Date();
        now.setHours(now.getHours() + 1, 0, 0, 0);
        deadlineInput.min = toLocalISO(new Date());
        deadlineInput.value = toLocalISO(now);
        newTaskDeadline = now.toISOString();
    }
    haptic('impact', 'light');
}

function clearDeadline() {
    deadlineRow.classList.remove('sheet__deadline-row--visible');
    deadlineBtn.classList.remove('sheet__deadline-btn--active');
    deadlineInput.value = '';
    newTaskDeadline = null;
}

function onDeadlineChange() {
    if (deadlineInput.value) {
        newTaskDeadline = new Date(deadlineInput.value).toISOString();
        deadlineBtn.classList.add('sheet__deadline-btn--active');
    } else {
        newTaskDeadline = null;
        deadlineBtn.classList.remove('sheet__deadline-btn--active');
    }
}

function toLocalISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}`;
}

function formatDeadline(isoStr) {
    const d = new Date(isoStr);
    const day = d.getDate();
    const month = MONTHS_SHORT[d.getMonth()];
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month}, ${h}:${m}`;
}

function getDeadlineStatus(isoStr) {
    const now = new Date();
    const deadline = new Date(isoStr);
    const diff = deadline - now;
    if (diff < 0) return 'overdue';
    if (diff < 24 * 60 * 60 * 1000) return 'soon';
    return 'normal';
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDisplayDate(date) {
    return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function isToday(date) {
    const now = new Date();
    return date.getDate() === now.getDate()
        && date.getMonth() === now.getMonth()
        && date.getFullYear() === now.getFullYear();
}

function isSameDay(a, b) {
    return a.getDate() === b.getDate()
        && a.getMonth() === b.getMonth()
        && a.getFullYear() === b.getFullYear();
}

function storageKey(dateStr) {
    return `tasks_${dateStr}`;
}

function saveTasks(dateStr, taskArray) {
    if (DEMO_MODE) return;
    const key = storageKey(dateStr);
    const val = JSON.stringify(taskArray);
    tg.CloudStorage.setItem(key, val, (err) => {
        if (err) console.error('CloudStorage save error:', err);
    });
}

function loadTasksFromStorage(dateStr, callback) {
    if (DEMO_MODE) { callback([]); return; }
    const key = storageKey(dateStr);
    tg.CloudStorage.getItem(key, (err, val) => {
        if (err || !val) { callback([]); return; }
        try { callback(JSON.parse(val)); }
        catch (_) { callback([]); }
    });
}

function renderCalendar() {
    calendarStrip.innerHTML = '';
    const today = new Date();
    const startDay = new Date(today);
    startDay.setDate(today.getDate() + calendarOffset - 3);

    for (let i = 0; i < 7; i++) {
        const date = new Date(startDay);
        date.setDate(startDay.getDate() + i);

        const el = document.createElement('div');
        el.className = 'cal-day';
        if (isSameDay(date, selectedDate)) el.classList.add('cal-day--active');
        if (isToday(date)) el.classList.add('cal-day--today');

        el.innerHTML = `
            <span class="cal-day__weekday">${WEEKDAYS[date.getDay()]}</span>
            <span class="cal-day__number">${date.getDate()}</span>
        `;

        const d = new Date(date);
        el.addEventListener('click', () => selectDate(d));
        calendarStrip.appendChild(el);
    }
}

function selectDate(date) {
    selectedDate = date;
    renderCalendar();
    headerDate.textContent = formatDisplayDate(date);

    taskList.classList.add('tasks--fading');
    setTimeout(() => {
        loadTasks();
        taskList.classList.remove('tasks--fading');
    }, 200);

    haptic('impact', 'light');
}

function loadTasks() {
    const dateStr = formatDate(selectedDate);
    headerDate.textContent = formatDisplayDate(selectedDate);

    if (DEMO_MODE) {
        tasks = [];
        renderTasks();
        return;
    }

    showLoading(true);
    showEmpty(false);
    taskList.innerHTML = '';

    loadTasksFromStorage(dateStr, (data) => {
        tasks = data;
        renderTasks();
        showLoading(false);
    });
}

function sortTasks(list) {
    const highUndone = list.filter(t => taskPriority(t) === 2 && !t.completed);
    const medUndone = list.filter(t => taskPriority(t) === 1 && !t.completed);
    const normalUndone = list.filter(t => taskPriority(t) === 0 && !t.completed);
    const done = list.filter(t => t.completed);
    return [...highUndone, ...medUndone, ...normalUndone, ...done];
}

function renderTasks() {
    taskList.innerHTML = '';
    updateStats();

    if (tasks.length === 0) {
        showEmpty(true);
        return;
    }

    showEmpty(false);

    const sorted = sortTasks(tasks);

    sorted.forEach((task, i) => {
        const el = createTaskElement(task);
        el.style.animationDelay = `${i * 0.03}s`;
        taskList.appendChild(el);
    });
}

function createTaskElement(task) {
    const el = document.createElement('div');
    el.className = 'task';
    const prio = taskPriority(task);
    if (task.completed) el.classList.add('task--done');
    if (prio === 2) el.classList.add('task--important');
    if (prio === 1) el.classList.add('task--medium');
    el.dataset.id = task.id;

    let priorityDot = '';
    if (prio === 2) priorityDot = '<div class="task__priority-dot"></div>';
    if (prio === 1) priorityDot = '<div class="task__priority-dot task__priority-dot--medium"></div>';

    let deadlineHtml = '';
    if (task.deadline) {
        const status = getDeadlineStatus(task.deadline);
        const statusClass = status === 'overdue' ? ' task__deadline-info--overdue' :
                            status === 'soon' ? ' task__deadline-info--soon' : '';
        const icon = status === 'overdue' ? '🔴' : status === 'soon' ? '🟠' : '🕐';
        deadlineHtml = `<div class="task__deadline-info${statusClass}">${icon} ${formatDeadline(task.deadline)}</div>`;
    }

    el.innerHTML = `
        <div class="task__check">
            <svg class="task__checkmark" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2.5 7.5L5.5 10.5L11.5 3.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        ${priorityDot}
        <div class="task__body">
            <span class="task__text">${escapeHtml(task.text)}</span>
            ${deadlineHtml}
        </div>
        <button class="task__delete" aria-label="Удалить">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
        </button>
    `;

    el.querySelector('.task__check').addEventListener('click', () => toggleTask(task, el));
    el.querySelector('.task__body').addEventListener('click', () => editTask(task));
    el.querySelector('.task__delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTask(task, el);
    });

    return el;
}

function editTask(task) {
    editingTask = task;
    openSheet();
    taskInput.value = task.text;
    taskInput.placeholder = 'Редактировать...';

    newTaskPriority = taskPriority(task);
    priorityBtn.classList.remove('sheet__priority--medium', 'sheet__priority--active');
    if (newTaskPriority === 1) priorityBtn.classList.add('sheet__priority--medium');
    if (newTaskPriority === 2) priorityBtn.classList.add('sheet__priority--active');

    if (task.deadline) {
        newTaskDeadline = task.deadline;
        deadlineRow.classList.add('sheet__deadline-row--visible');
        deadlineBtn.classList.add('sheet__deadline-btn--active');
        deadlineInput.value = toLocalISO(new Date(task.deadline));
    } else {
        clearDeadline();
    }
}

function addTask() {
    const text = taskInput.value.trim();
    if (!text) return;

    if (editingTask) {
        editingTask.text = text;
        editingTask.priority = newTaskPriority;
        editingTask.important = newTaskPriority === 2;
        editingTask.deadline = newTaskDeadline || null;

        if (editingTask.deadline) {
            pendingDeadlines.push({
                text: editingTask.text,
                deadline: editingTask.deadline,
                date: editingTask.date,
                important: editingTask.priority === 2
            });
            updateMainButton();
        }

        renderTasks();
        saveTasks(formatDate(selectedDate), tasks);
        haptic('notification', 'success');
        editingTask = null;
        taskInput.value = '';
        resetPriorityBtn();
        clearDeadline();
        closeSheet();
        return;
    }

    taskInput.value = '';
    sendBtn.disabled = true;

    const task = {
        id: idCounter++,
        text,
        date: formatDate(selectedDate),
        completed: false,
        priority: newTaskPriority,
        important: newTaskPriority === 2,
        deadline: newTaskDeadline || null
    };
    tasks.push(task);

    renderTasks();
    haptic('notification', 'success');

    saveTasks(task.date, tasks);

    if (task.deadline) {
        pendingDeadlines.push({
            text: task.text,
            deadline: task.deadline,
            date: task.date,
            important: task.priority === 2
        });
        updateMainButton();
    }

    resetPriorityBtn();
    clearDeadline();

    sendBtn.disabled = false;
    closeSheet();
}

function toggleTask(task, el) {
    task.completed = !task.completed;
    el.classList.toggle('task--done');
    el.classList.add('task--completing');
    setTimeout(() => el.classList.remove('task--completing'), 400);
    updateStats();

    haptic('impact', task.completed ? 'medium' : 'light');

    saveTasks(formatDate(selectedDate), tasks);
}

function deleteTask(task, el) {
    el.classList.add('task--removing');
    haptic('impact', 'light');

    setTimeout(() => {
        el.remove();
        tasks = tasks.filter(t => t.id !== task.id);
        updateStats();
        if (tasks.length === 0) showEmpty(true);

        saveTasks(formatDate(selectedDate), tasks);
    }, 350);
}

function updateStats() {
    const total = tasks.length;
    const done = tasks.filter(t => t.completed).length;
    animateNumber(statsDone, done);
    animateNumber(statsTotal, total);
}

function animateNumber(el, target) {
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;
    el.style.transition = 'transform 0.2s, opacity 0.2s';
    el.style.transform = 'translateY(-8px)';
    el.style.opacity = '0';
    setTimeout(() => {
        el.textContent = target;
        el.style.transform = 'translateY(8px)';
        setTimeout(() => {
            el.style.transform = 'translateY(0)';
            el.style.opacity = '1';
        }, 30);
    }, 150);
}

function openSheet() {
    isSheetOpen = true;
    addSheet.classList.add('sheet--open');
    fabBtn.classList.add('fab--open');
    setTimeout(() => taskInput.focus(), 350);
    haptic('impact', 'light');
}

function closeSheet() {
    isSheetOpen = false;
    addSheet.classList.remove('sheet--open');
    fabBtn.classList.remove('fab--open');
    taskInput.blur();
    taskInput.value = '';
    taskInput.placeholder = 'Новая задача...';
    editingTask = null;
    resetPriorityBtn();
    clearDeadline();
}

function resetPriorityBtn() {
    newTaskPriority = 0;
    priorityBtn.classList.remove('sheet__priority--medium', 'sheet__priority--active');
}

function showEmpty(visible) {
    emptyState.classList.toggle('empty--visible', visible);
}

function showLoading(visible) {
    loading.classList.toggle('loading--visible', visible);
}

function setupMainButton() {
    if (!tg?.MainButton) return;
    tg.MainButton.onClick(() => {
        syncDeadlines();
    });
}

function updateMainButton() {
    if (!tg?.MainButton) return;
    if (pendingDeadlines.length > 0) {
        tg.MainButton.setText('Сохранить напоминания (' + pendingDeadlines.length + ')');
        tg.MainButton.color = '#FF9500';
        tg.MainButton.textColor = '#FFFFFF';
        tg.MainButton.show();
    }
}

function syncDeadlines() {
    if (!tg || pendingDeadlines.length === 0) return;
    const data = JSON.stringify({
        action: 'sync_deadlines',
        deadlines: pendingDeadlines
    });
    tg.sendData(data);
}

function haptic(type, style) {
    try {
        if (type === 'impact') {
            tg.HapticFeedback.impactOccurred(style);
        } else if (type === 'notification') {
            tg.HapticFeedback.notificationOccurred(style);
        }
    } catch (_) {}
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
