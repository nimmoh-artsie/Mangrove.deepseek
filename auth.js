// =============================================
// MANGROVE CAFÉ - AUTHENTICATION MODULE
// Register, Login, Profile Management
// =============================================

// Handle user registration
async function handleRegister() {
    const name = document.getElementById('regName').value;
    const phone = document.getElementById('regPhone').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const branch_id = document.getElementById('regBranch').value;

    // Validation
    if (!name || !phone || !password || !branch_id) {
        window.showNotification('Error', 'Please fill in all required fields', 'error');
        return;
    }

    if (phone.length < 10) {
        window.showNotification('Error', 'Please enter a valid phone number', 'error');
        return;
    }

    if (password.length < 6) {
        window.showNotification('Error', 'Password must be at least 6 characters', 'error');
        return;
    }

    try {
        const data = await window.apiRequest('/api/register', {
            method: 'POST',
            body: JSON.stringify({
                name,
                phone,
                email: email || undefined,
                password,
                branch_id: parseInt(branch_id)
            })
        });

        window.showNotification('Success', 'Registration successful! Please login.', 'success');
        
        // Clear form
        document.getElementById('registerForm').reset();
        
        // Go to login page
        window.showPage('login');
    } catch (error) {
        console.error('Registration error:', error);
        // Error already shown by apiRequest
    }
}

// Handle login
async function handleLogin() {
    const phone = document.getElementById('loginPhone').value;
    const password = document.getElementById('loginPassword').value;

    if (!phone || !password) {
        window.showNotification('Error', 'Please enter phone and password', 'error');
        return;
    }

    try {
        const data = await window.apiRequest('/api/login', {
            method: 'POST',
            body: JSON.stringify({ phone, password })
        });

        // Save token and user data
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        window.AppState.token = data.token;
        window.AppState.currentUser = data.user;
        
        window.showNotification('Welcome!', `Welcome back to Mangrove Café, ${data.user.name}!`, 'success');
        
        // Update UI
        window.updateUIForUser();
        window.connectWebSocket();
        window.startNotificationPolling();
        
        // Go to menu
        window.showPage('menu');
    } catch (error) {
        console.error('Login error:', error);
        // Error already shown by apiRequest
    }
}

// Show profile page
async function showProfile() {
    if (!window.AppState.currentUser) {
        window.showPage('login');
        return;
    }

    try {
        const data = await window.apiRequest('/api/profile');
        
        // Create profile page if not exists
        createProfilePage(data.user);
        window.showPage('profile');
    } catch (error) {
        console.error('Failed to load profile:', error);
    }
}

// Create profile page dynamically
function createProfilePage(user) {
    // Check if profile page already exists
    if (document.getElementById('profilePage')) return;

    const main = document.querySelector('main');
    const profilePage = document.createElement('div');
    profilePage.id = 'profilePage';
    profilePage.className = 'page';

    profilePage.innerHTML = `
        <h2 class="page-title">My Profile</h2>
        
        <div class="profile-container">
            <div class="profile-card">
                <div class="profile-header">
                    <div class="profile-avatar">
                        <span class="avatar-icon">👤</span>
                    </div>
                    <h3>${user.name}</h3>
                    <p class="profile-role">${user.role.charAt(0).toUpperCase() + user.role.slice(1)}</p>
                </div>
                
                <div class="profile-details">
                    <div class="detail-item">
                        <span class="detail-label">📱 Phone</span>
                        <span class="detail-value">${user.phone}</span>
                    </div>
                    
                    <div class="detail-item">
                        <span class="detail-label">📧 Email</span>
                        <span class="detail-value">${user.email || 'Not provided'}</span>
                    </div>
                    
                    <div class="detail-item">
                        <span class="detail-label">📍 Branch</span>
                        <span class="detail-value">${user.branch_name || 'Not assigned'}</span>
                    </div>
                    
                    ${user.role === 'rider' ? `
                        <div class="detail-item">
                            <span class="detail-label">🛵 Vehicle</span>
                            <span class="detail-value">${user.vehicle_type || 'Motorcycle'}</span>
                        </div>
                        
                        <div class="detail-item">
                            <span class="detail-label">📊 Deliveries</span>
                            <span class="detail-value">${user.total_deliveries || 0}</span>
                        </div>
                        
                        <div class="detail-item">
                            <span class="detail-label">⭐ Rating</span>
                            <span class="detail-value">${user.rating || 5.0} ⭐</span>
                        </div>
                    ` : ''}
                </div>
                
                <div class="profile-actions">
                    <button onclick="showChangePassword()" class="btn-secondary">
                        <span class="btn-icon">🔒</span> Change Password
                    </button>
                    
                    <button onclick="window.logout()" class="btn-primary">
                        <span class="btn-icon">🚪</span> Logout
                    </button>
                </div>
            </div>
            
            <div class="stats-card">
                <h4>Account Statistics</h4>
                <div class="stats-grid">
                    <div class="stat-box">
                        <span class="stat-number" id="totalOrders">-</span>
                        <span class="stat-label">Total Orders</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-number" id="totalSpent">-</span>
                        <span class="stat-label">Total Spent</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-number" id="memberSince">-</span>
                        <span class="stat-label">Member Since</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    main.appendChild(profilePage);
    
    // Load user stats
    loadUserStats();
}

// Load user statistics
async function loadUserStats() {
    try {
        const orders = await window.apiRequest('/api/my-orders');
        
        const totalOrders = orders.length;
        const totalSpent = orders.reduce((sum, order) => sum + order.total_amount, 0);
        
        document.getElementById('totalOrders').textContent = totalOrders;
        document.getElementById('totalSpent').textContent = window.formatCurrency(totalSpent);
        
        if (orders.length > 0) {
            const firstOrder = new Date(orders[orders.length - 1].created_at);
            document.getElementById('memberSince').textContent = firstOrder.toLocaleDateString('en-KE', {
                month: 'short',
                year: 'numeric'
            });
        } else {
            document.getElementById('memberSince').textContent = 'Just joined';
        }
    } catch (error) {
        console.error('Failed to load user stats:', error);
    }
}

// Show change password form
function showChangePassword() {
    const modal = document.getElementById('itemModal');
    const content = document.getElementById('modalContent');
    
    content.innerHTML = `
        <h2>Change Password</h2>
        
        <form onsubmit="event.preventDefault(); changePassword()">
            <div class="form-group">
                <label for="currentPassword">Current Password</label>
                <input type="password" id="currentPassword" required>
            </div>
            
            <div class="form-group">
                <label for="newPassword">New Password</label>
                <input type="password" id="newPassword" required minlength="6">
            </div>
            
            <div class="form-group">
                <label for="confirmPassword">Confirm New Password</label>
                <input type="password" id="confirmPassword" required>
            </div>
            
            <button type="submit" class="btn-primary btn-block">
                <span class="btn-icon">🔒</span> Update Password
            </button>
            
            <button type="button" onclick="window.closeModal()" class="btn-secondary btn-block">
                Cancel
            </button>
        </form>
    `;
    
    modal.style.display = 'block';
}

// Change password
async function changePassword() {
    const current = document.getElementById('currentPassword').value;
    const newPass = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;
    
    if (!current || !newPass || !confirm) {
        window.showNotification('Error', 'Please fill in all fields', 'error');
        return;
    }
    
    if (newPass !== confirm) {
        window.showNotification('Error', 'New passwords do not match', 'error');
        return;
    }
    
    if (newPass.length < 6) {
        window.showNotification('Error', 'Password must be at least 6 characters', 'error');
        return;
    }
    
    try {
        await window.apiRequest('/api/change-password', {
            method: 'POST',
            body: JSON.stringify({
                current_password: current,
                new_password: newPass
            })
        });
        
        window.showNotification('Success', 'Password changed successfully', 'success');
        window.closeModal();
    } catch (error) {
        console.error('Password change failed:', error);
    }
}

// Export functions
window.handleRegister = handleRegister;
window.handleLogin = handleLogin;
window.showProfile = showProfile;
window.showChangePassword = showChangePassword;
window.changePassword = changePassword;