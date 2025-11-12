// Enhanced dashboard.js with all new features
class DashboardApp {
    constructor() {
        this.allData = {
            revenueByBooth: {},
            topServices: {},
            revenueByService: {},
            topBooths: {},
            summary: {},
            serviceLimits: [],
            trends: [],
            benchmarks: {},
            alerts: []
        };

        this.currentFilters = {
            booth: 'all',
            service: 'all',
            dateRange: 'all',
            startDate: null,
            endDate: null
        };

        this.user = null;
        this.socket = null;
        this.chartInstances = new Map();
        this.notificationCount = 0;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuthentication();
        this.connectWebSocket();
        this.loadInitialData();
        this.setupServiceWorker();
    }

    // Authentication Management
    async checkAuthentication() {
        try {
            // Check if user is already logged in (from session)
            const response = await fetch('/api/user', {
                credentials: 'include'
            });
            
            if (response.ok) {
                const userData = await response.json();
                this.handleLoginSuccess(userData);
            } else {
                this.showLoginModal();
            }
        } catch (error) {
            console.log('No active session, showing login modal');
            this.showLoginModal();
        }
    }

    async login(username, password) {
        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
                credentials: 'include' // <-- ensure session/cookies sent
            });

            if (response.ok) {
                const data = await response.json();
                this.handleLoginSuccess(data);
                this.hideLoginModal();
                this.showNotification('Login successful!', 'success');
            } else {
                this.showNotification('Invalid credentials!', 'error');
            }
        } catch (error) {
            this.showNotification('Login failed!', 'error');
        }
    }

    async logout() {
        try {
            await fetch('/logout', { credentials: 'include' }); // Ensure cookies/session sent
            this.user = null;
            this.updateUIForAuthentication();
            this.showLoginModal();
            this.showNotification('Logged out successfully!', 'info');
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    handleLoginSuccess(userData) {
        this.user = userData.user;
        this.updateUIForAuthentication();
        this.loadAllData();
    }

    updateUIForAuthentication() {
        const userInfo = document.getElementById('userInfo');
        const loginBtn = document.getElementById('loginBtn');
        const usernameSpan = document.getElementById('username');
        const userRoleSpan = document.getElementById('userRole');

        if (this.user) {
            userInfo.style.display = 'flex';
            loginBtn.style.display = 'none';
            usernameSpan.textContent = this.user.username;
            userRoleSpan.textContent = this.user.role;
            
            // Update UI based on user role
            this.updateUIBasedOnRole();
        } else {
            userInfo.style.display = 'none';
            loginBtn.style.display = 'flex';
        }
    }

    updateUIBasedOnRole() {
        const adminElements = document.querySelectorAll('[data-role="admin"]');
        const managerElements = document.querySelectorAll('[data-role="manager"]');
        
        if (this.user.role === 'admin') {
            adminElements.forEach(el => el.style.display = 'block');
            managerElements.forEach(el => el.style.display = 'block');
        } else if (this.user.role === 'manager') {
            adminElements.forEach(el => el.style.display = 'none');
            managerElements.forEach(el => el.style.display = 'block');
        } else {
            adminElements.forEach(el => el.style.display = 'none');
            managerElements.forEach(el => el.style.display = 'none');
        }
    }

    // WebSocket Real-time Updates
    connectWebSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('Connected to real-time updates');
            this.showNotification('Real-time updates connected', 'info', 3000);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from real-time updates');
            this.showNotification('Real-time updates disconnected', 'warning', 5000);
        });

        this.socket.on('data_update', (data) => {
            this.handleRealTimeUpdate(data);
        });

        this.socket.on('new_alert', (alert) => {
            this.handleNewAlert(alert);
        });
    }

    handleRealTimeUpdate(data) {
        this.showNotification('Data updated in real-time', 'info', 2000);
        this.loadAllData(); // Reload all data
    }

    // Notification System
    showNotification(message, type = 'info', duration = 5000) {
        const notificationsContainer = document.getElementById('notificationsContainer');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icons = {
            info: 'fa-info-circle',
            success: 'fa-check-circle',
            warning: 'fa-exclamation-triangle',
            error: 'fa-times-circle'
        };

        notification.innerHTML = `
            <i class="fas ${icons[type]}"></i>
            <span>${message}</span>
            <button class="notification-close" onclick="this.parentElement.remove(); dashboard.updateNotificationCount();">
                <i class="fas fa-times"></i>
            </button>
        `;

        notificationsContainer.appendChild(notification);

        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                    this.updateNotificationCount();
                }
            }, duration);
        }

        this.updateNotificationCount();
    }

    updateNotificationCount() {
        const count = document.querySelectorAll('.notification').length;
        this.notificationCount = count;
        document.getElementById('notificationCount').textContent = count;
    }

    // Theme Management
    toggleTheme() {
        const currentTheme = document.body.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('dashboard-theme', newTheme);
        
        // Update charts for new theme
        this.updateChartsForTheme(newTheme);
        
        this.showNotification(`Switched to ${newTheme} theme`, 'info');
    }

    updateChartsForTheme(theme) {
        const textColor = theme === 'dark' ? '#ffffff' : '#1e293b';
        const gridColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        
        this.chartInstances.forEach(chart => {
            if (chart.options) {
                chart.options.scales.x.ticks.color = textColor;
                chart.options.scales.y.ticks.color = textColor;
                chart.options.scales.x.grid.color = gridColor;
                chart.options.scales.y.grid.color = gridColor;
                chart.update();
            }
        });
    }

    // Service Worker for PWA
    async setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered');
            } catch (error) {
                console.log('Service Worker registration failed:', error);
            }
        }
    }

    // Data Loading with Enhanced Error Handling
    async loadAllData() {
        if (!this.user) return;

        try {
            const endpoints = [
                '/api/revenue_by_booth',
                '/api/top_services',
                '/api/revenue_by_service',
                '/api/top_booths',
                '/api/summary',
                '/api/service_limits',
                '/api/trends',
                '/api/benchmarks',
                '/api/alerts'
            ];

            const requests = endpoints.map(endpoint => 
                fetch(endpoint).then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
            );

            const results = await Promise.allSettled(requests);
            
            // Process results with error handling
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    this.handleDataSuccess(endpoints[index], result.value);
                } else {
                    this.handleDataError(endpoints[index], result.reason);
                }
            });

            this.renderAllCharts();
            this.populateFilterOptions();
            this.renderServiceLimits();
            this.renderAlerts();

        } catch (error) {
            this.showNotification('Failed to load dashboard data', 'error');
            console.error('Data loading error:', error);
        }
    }

    handleDataSuccess(endpoint, data) {
        // Normalize key: e.g. revenue_by_booth -> revenueByBooth
        const key = endpoint.split('/').pop();
        this.allData[key] = data;
        // Also set camelCase for chart renderers
        const camelKey = key.replace(/_([a-z])/g, (_,c)=>c.toUpperCase());
        this.allData[camelKey] = data;
    }

    handleDataError(endpoint, error) {
        console.error(`Error loading ${endpoint}:`, error);
        this.showNotification(`Failed to load ${endpoint.replace('/api/', '')}`, 'warning');
    }

    // Enhanced Chart Rendering with Responsive Features
    getResponsiveFontSize() {
        const width = window.innerWidth;
        if (width < 480) return 10;    // Mobile
        if (width < 768) return 11;    // Small tablet
        if (width < 1024) return 12;   // Tablet
        if (width < 1440) return 13;   // Desktop
        return 14;                     // Large desktop
    }

    getChartColors(theme = 'dark') {
        return theme === 'dark' ? {
            primary: '#3b82f6',
            success: '#10b981',
            danger: '#ef4444',
            warning: '#f59e0b',
            text: '#ffffff',
            grid: 'rgba(255, 255, 255, 0.1)',
            background: 'rgba(255, 255, 255, 0.1)'
        } : {
            primary: '#1d4ed8',
            success: '#047857',
            danger: '#dc2626',
            warning: '#d97706',
            text: '#1e293b',
            grid: 'rgba(0, 0, 0, 0.1)',
            background: 'rgba(255, 255, 255, 0.9)'
        };
    }

    renderRevenueByBooth() {
        const ctx = document.getElementById('boothChart');
        if (!ctx) return;

        this.destroyChart('boothChart');

        const fontSize = this.getResponsiveFontSize();
        const colors = this.getChartColors(document.body.getAttribute('data-theme'));
        const isMobile = window.innerWidth < 768;

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(this.allData.revenue_by_booth),
                datasets: [{
                    label: 'Revenue (ZMW)',
                    data: Object.values(this.allData.revenue_by_booth),
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                    borderWidth: 1,
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 10,
                        right: isMobile ? 5 : 10,
                        bottom: 10,
                        left: isMobile ? 5 : 10
                    }
                },
                plugins: {
                    legend: {
                        display: !isMobile,
                        position: 'top',
                        labels: {
                            color: colors.text,
                            font: { size: fontSize }
                        }
                    },
                    tooltip: {
                        backgroundColor: colors.background,
                        titleColor: colors.text,
                        bodyColor: colors.text,
                        borderColor: colors.primary,
                        borderWidth: 1,
                        cornerRadius: 8,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                return `ZMW ${context.parsed.y.toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: colors.text,
                            font: { size: fontSize - 1 },
                            maxRotation: isMobile ? 45 : 0,
                            minRotation: isMobile ? 45 : 0
                        },
                        grid: { color: colors.grid }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: colors.text,
                            font: { size: fontSize - 1 },
                            callback: function(value) {
                                return 'ZMW ' + value.toLocaleString();
                            }
                        },
                        grid: { color: colors.grid }
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });

        this.chartInstances.set('boothChart', chart);
    }

    renderTopServices() {
        const ctx = document.getElementById('serviceChart');
        if (!ctx) return;

        this.destroyChart('serviceChart');

        const fontSize = this.getResponsiveFontSize();
        const colors = this.getChartColors(document.body.getAttribute('data-theme'));
        const isMobile = window.innerWidth < 768;

        const chart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: Object.keys(this.allData.top_services),
                datasets: [{
                    label: 'Usage Count',
                    data: Object.values(this.allData.top_services),
                    backgroundColor: [
                        colors.primary,
                        colors.success,
                        colors.warning,
                        colors.danger,
                        '#8b5cf6'
                    ],
                    borderColor: colors.background,
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: isMobile ? 5 : 15
                },
                plugins: {
                    legend: {
                        display: true,
                        position: isMobile ? 'bottom' : 'right',
                        labels: {
                            color: colors.text,
                            font: { size: isMobile ? fontSize - 1 : fontSize },
                            boxWidth: isMobile ? 12 : 14,
                            padding: isMobile ? 10 : 15
                        }
                    },
                    tooltip: {
                        backgroundColor: colors.background,
                        titleColor: colors.text,
                        bodyColor: colors.text,
                        borderColor: colors.primary,
                        borderWidth: 1,
                        cornerRadius: 8,
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                },
                cutout: isMobile ? '40%' : '50%'
            }
        });

        this.chartInstances.set('serviceChart', chart);
    }

    renderTrendsChart() {
        const ctx = document.getElementById('trendsChart');
        if (!ctx) return;

        this.destroyChart('trendsChart');

        const fontSize = this.getResponsiveFontSize();
        const colors = this.getChartColors(document.body.getAttribute('data-theme'));

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.allData.trends.map(t => new Date(t.date).toLocaleDateString()),
                datasets: [{
                    label: 'Daily Revenue',
                    data: this.allData.trends.map(t => t.revenue),
                    borderColor: colors.primary,
                    backgroundColor: colors.primary + '20',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: colors.text,
                            font: { size: fontSize }
                        }
                    },
                    tooltip: {
                        backgroundColor: colors.background,
                        titleColor: colors.text,
                        bodyColor: colors.text,
                        borderColor: colors.primary,
                        borderWidth: 1,
                        cornerRadius: 8,
                        callbacks: {
                            label: function(context) {
                                return `ZMW ${context.parsed.y.toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: colors.text,
                            font: { size: fontSize - 1 },
                            maxRotation: 45
                        },
                        grid: { color: colors.grid }
                    },
                    y: {
                        ticks: {
                            color: colors.text,
                            font: { size: fontSize - 1 },
                            callback: function(value) {
                                return 'ZMW ' + value.toLocaleString();
                            }
                        },
                        grid: { color: colors.grid }
                    }
                }
            }
        });

        this.chartInstances.set('trendsChart', chart);
    }

    // Destroy chart helper
    destroyChart(chartId) {
        if (this.chartInstances.has(chartId)) {
            this.chartInstances.get(chartId).destroy();
            this.chartInstances.delete(chartId);
        }
    }

    // Render all charts
    renderAllCharts() {
        this.renderRevenueByBooth();
        this.renderTopServices();
        this.renderRevenueByService();
        this.renderTopBooths();
        
        if (this.allData.trends && this.allData.trends.length > 0) {
            this.renderTrendsChart();
        }
        
        this.updateSummary();
    }

    // Enhanced Event Listeners
    setupEventListeners() {
        // Authentication
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) loginBtn.addEventListener('click', () => this.showLoginModal());
        const submitLogin = document.getElementById('submitLogin');
        if (submitLogin) submitLogin.addEventListener('click', () => this.handleLoginSubmit());
        const closeLogin = document.getElementById('closeLogin');
        if (closeLogin) closeLogin.addEventListener('click', () => this.hideLoginModal());
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout());

        // Theme & Controls
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.addEventListener('click', () => this.toggleTheme());
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportData());
        const notificationsBtn = document.getElementById('notificationsBtn');
        if (notificationsBtn) notificationsBtn.addEventListener('click', () => this.toggleNotifications());

        // Filters
        const applyFilters = document.getElementById('applyFilters');
        if (applyFilters) applyFilters.addEventListener('click', () => this.applyFilters());
        const resetFilters = document.getElementById('resetFilters');
        if (resetFilters) resetFilters.addEventListener('click', () => this.resetFilters());

        // Analytics
        const viewTrends = document.getElementById('viewTrends');
        if (viewTrends) viewTrends.addEventListener('click', () => this.showTrends());
        const viewBenchmarks = document.getElementById('viewBenchmarks');
        if (viewBenchmarks) viewBenchmarks.addEventListener('click', () => this.showBenchmarks());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));

        // Responsive resize handling
        window.addEventListener('resize', () => this.handleResize());
        window.addEventListener('orientationchange', () => this.handleOrientationChange());
    }

    handleKeyboardShortcuts(e) {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key) {
                case 'l':
                    e.preventDefault();
                    this.showLoginModal();
                    break;
                case 't':
                    e.preventDefault();
                    this.toggleTheme();
                    break;
                case 'e':
                    e.preventDefault();
                    this.exportData();
                    break;
            }
        }
    }

    // Enhanced Resize Handling
    handleResize() {
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
            this.renderAllCharts();
        }, 250);
    }

    handleOrientationChange() {
        setTimeout(() => {
            this.renderAllCharts();
        }, 500);
    }

    // Export functionality
    async exportData() {
        try {
            const response = await fetch('/api/export_csv');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mobile_booth_export_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            this.showNotification('Data exported successfully!', 'success');
        } catch (error) {
            this.showNotification('Export failed!', 'error');
        }
    }

    // Modal Management
    showLoginModal() {
        document.getElementById('loginModal').classList.add('active');
    }

    hideLoginModal() {
        document.getElementById('loginModal').classList.remove('active');
    }

    handleLoginSubmit() {
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        
        if (username && password) {
            this.login(username, password);
        } else {
            this.showNotification('Please enter both username and password', 'warning');
        }
    }

    // Add the missing methods for completeness
    renderRevenueByService() {
        // Implementation similar to renderRevenueByBooth
        const ctx = document.getElementById('revenueServiceChart');
        if (!ctx) return;

        this.destroyChart('revenueServiceChart');

        const fontSize = this.getResponsiveFontSize();
        const colors = this.getChartColors(document.body.getAttribute('data-theme'));

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(this.allData.revenue_by_service),
                datasets: [{
                    label: 'Revenue (ZMW)',
                    data: Object.values(this.allData.revenue_by_service),
                    backgroundColor: colors.success,
                    borderColor: colors.success,
                    borderWidth: 1,
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: colors.text, font: { size: fontSize } }
                    },
                    tooltip: {
                        backgroundColor: colors.background,
                        titleColor: colors.text,
                        bodyColor: colors.text,
                        borderColor: colors.success,
                        callbacks: {
                            label: function(context) {
                                return `ZMW ${context.parsed.y.toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: colors.text,
                            font: { size: fontSize - 1 },
                            maxRotation: 45
                        },
                        grid: { color: colors.grid }
                    },
                    y: {
                        ticks: {
                            color: colors.text,
                            font: { size: fontSize - 1 },
                            callback: function(value) {
                                return 'ZMW ' + value.toLocaleString();
                            }
                        },
                        grid: { color: colors.grid }
                    }
                }
            }
        });

        this.chartInstances.set('revenueServiceChart', chart);
    }

    renderTopBooths() {
        // Implementation similar to other chart methods
        const ctx = document.getElementById('topBoothsChart');
        if (!ctx) return;

        this.destroyChart('topBoothsChart');

        const fontSize = this.getResponsiveFontSize();
        const colors = this.getChartColors(document.body.getAttribute('data-theme'));

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(this.allData.top_booths),
                datasets: [{
                    label: 'Revenue (ZMW)',
                    data: Object.values(this.allData.top_booths),
                    backgroundColor: colors.danger,
                    borderColor: colors.danger,
                    borderWidth: 1,
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: colors.text, font: { size: fontSize } }
                    },
                    tooltip: {
                        backgroundColor: colors.background,
                        titleColor: colors.text,
                        bodyColor: colors.text,
                        borderColor: colors.danger,
                        callbacks: {
                            label: function(context) {
                                return `ZMW ${context.parsed.y.toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: colors.text,
                            font: { size: fontSize - 1 }
                        },
                        grid: { color: colors.grid }
                    },
                    y: {
                        ticks: {
                            color: colors.text,
                            font: { size: fontSize - 1 },
                            callback: function(value) {
                                return 'ZMW ' + value.toLocaleString();
                            }
                        },
                        grid: { color: colors.grid }
                    }
                }
            }
        });

        this.chartInstances.set('topBoothsChart', chart);
    }

    updateSummary() {
        const totalRevenueEl = document.getElementById('totalRevenue');
        const totalTransactionsEl = document.getElementById('totalTransactions');
        const uniqueServicesEl = document.getElementById('uniqueServices');
        const uniqueBoothsEl = document.getElementById('uniqueBooths');
        if (!totalRevenueEl || !totalTransactionsEl || !uniqueServicesEl || !uniqueBoothsEl) return;
        totalRevenueEl.textContent = 
            `ZMW ${this.allData.summary.total_revenue?.toLocaleString() || '0'}`;
        totalTransactionsEl.textContent = 
            this.allData.summary.total_transactions?.toLocaleString() || '0';
        uniqueServicesEl.textContent = 
            this.allData.summary.unique_services || '0';
        uniqueBoothsEl.textContent = 
            this.allData.summary.unique_booths || '0';
    }

    populateFilterOptions() {
        // Implementation for populating filter dropdowns
        const boothFilter = document.getElementById('boothFilter');
        const serviceFilter = document.getElementById('serviceFilter');
        
        // Clear existing options except first
        while (boothFilter.children.length > 1) boothFilter.removeChild(boothFilter.lastChild);
        while (serviceFilter.children.length > 1) serviceFilter.removeChild(serviceFilter.lastChild);
        
        // Add booth options
        Object.keys(this.allData.revenue_by_booth).forEach(booth => {
            const option = document.createElement('option');
            option.value = booth;
            option.textContent = booth;
            boothFilter.appendChild(option);
        });
        
        // Add service options
        Object.keys(this.allData.top_services).forEach(service => {
            const option = document.createElement('option');
            option.value = service;
            option.textContent = service;
            serviceFilter.appendChild(option);
        });
    }

    renderServiceLimits() {
        const container = document.getElementById('serviceLimitsContainer');
        if (!container) return;

        let html = '';
        this.allData.service_limits.forEach(service => {
            const isLow = service.is_low;
            html += `
                <div class="service-item">
                    <div class="service-name">${service.service}</div>
                    <div class="service-limit">
                        K ${service.current_usage.toLocaleString()} / K ${service.limit.toLocaleString()}
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill ${isLow ? 'high' : ''}" 
                             style="width: ${Math.min(service.usage_percentage, 100)}%"></div>
                    </div>
                    <div class="service-remaining ${isLow ? 'low' : ''}">
                        Remaining: K ${service.remaining.toLocaleString()}
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }

    renderAlerts() {
        // Implementation for rendering alerts
        this.allData.alerts.forEach(alert => {
            this.showNotification(alert.message, alert.severity, 10000);
        });
    }

    applyFilters() {
        // Implementation for applying filters
        this.currentFilters.booth = document.getElementById('boothFilter').value;
        this.currentFilters.service = document.getElementById('serviceFilter').value;
        this.currentFilters.dateRange = document.getElementById('dateRange').value;
        
        this.loadAllData();
        this.showNotification('Filters applied successfully', 'success');
    }

    resetFilters() {
        // Implementation for resetting filters
        document.getElementById('boothFilter').value = 'all';
        document.getElementById('serviceFilter').value = 'all';
        document.getElementById('dateRange').value = 'all';
        
        this.currentFilters = {
            booth: 'all',
            service: 'all',
            dateRange: 'all',
            startDate: null,
            endDate: null
        };
        
        this.loadAllData();
        this.showNotification('Filters reset', 'info');
    }

    showTrends() {
        const trendsSection = document.getElementById('trendsSection');
        trendsSection.style.display = 'block';
        this.renderTrendsChart();
    }

    showBenchmarks() {
        if (this.allData.benchmarks) {
            const message = `Top performer: ${this.allData.benchmarks.top_performer.booth} 
                           (ZMW ${this.allData.benchmarks.top_performer.revenue.toLocaleString()})`;
            this.showNotification(message, 'info', 8000);
        }
    }

    toggleNotifications() {
        const container = document.getElementById('notificationsContainer');
        container.style.display = container.style.display === 'none' ? 'flex' : 'none';
    }

    handleNewAlert(alert) {
        this.showNotification(alert.message, alert.severity, 10000);
    }

    loadInitialData() {
        // Load initial data without authentication
        this.loadPublicData();
    }

    async loadPublicData() {
        try {
            const response = await fetch('/api/summary');
            if (response.ok) {
                const data = await response.json();
                this.allData.summary = data;
                this.updateSummary();
            }
        } catch (error) {
            console.log('Could not load public data');
        }
    }
}

// Initialize the dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new DashboardApp();
});

// Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js')
            .then(function(registration) {
                console.log('ServiceWorker registration successful');
            })
            .catch(function(err) {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}