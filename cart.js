// =============================================
// MANGROVE CAFÉ - SHOPPING CART MODULE
// Cart Management and Checkout
// =============================================

// Show item modal for customization
function showItemModal(itemId) {
    const item = window.AppState.menu.find(i => i.id === itemId);
    if (!item) return;
    
    const modal = document.getElementById('itemModal');
    const content = document.getElementById('modalContent');
    
    content.innerHTML = `
        <div class="modal-item">
            <h2>${item.name}</h2>
            <p class="modal-description">${item.description || ''}</p>
            <p class="modal-price">${window.formatCurrency(item.price)}</p>
            
            <div class="form-group">
                <label for="modalQuantity">
                    <span class="label-icon">🔢</span> Quantity
                </label>
                <div class="quantity-selector">
                    <button type="button" onclick="adjustQuantity(-1)" class="qty-btn">-</button>
                    <input type="number" id="modalQuantity" value="1" min="1" max="10" readonly>
                    <button type="button" onclick="adjustQuantity(1)" class="qty-btn">+</button>
                </div>
            </div>
            
            <div class="form-group">
                <label for="modalInstructions">
                    <span class="label-icon">📝</span> Special Instructions
                </label>
                <textarea id="modalInstructions" rows="3" placeholder="Any special requests? (allergies, preferences, etc.)"></textarea>
            </div>
            
            <div class="modal-total">
                <span>Total:</span>
                <span id="modalItemTotal">${window.formatCurrency(item.price)}</span>
            </div>
            
            <button class="btn-primary btn-block" onclick="addToCart(${item.id})">
                <span class="btn-icon">➕</span> Add to Cart
            </button>
            
            <button class="btn-secondary btn-block" onclick="window.closeModal()">
                Cancel
            </button>
        </div>
    `;
    
    // Add quantity adjustment listener
    window.currentModalItem = item;
    modal.style.display = 'block';
}

// Adjust quantity in modal
function adjustQuantity(change) {
    const input = document.getElementById('modalQuantity');
    let value = parseInt(input.value) + change;
    if (value < 1) value = 1;
    if (value > 10) value = 10;
    input.value = value;
    
    // Update total
    if (window.currentModalItem) {
        const total = window.currentModalItem.price * value;
        document.getElementById('modalItemTotal').textContent = window.formatCurrency(total);
    }
}

// Add to cart
function addToCart(itemId) {
    const quantity = parseInt(document.getElementById('modalQuantity').value);
    const instructions = document.getElementById('modalInstructions').value;
    const item = window.AppState.menu.find(i => i.id === itemId);
    
    const cartItem = {
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: quantity,
        instructions: instructions,
        addedAt: new Date().toISOString()
    };
    
    // Check if item already in cart
    const existingIndex = window.AppState.cart.findIndex(i => i.id === itemId);
    if (existingIndex >= 0) {
        window.AppState.cart[existingIndex].quantity += quantity;
        if (instructions) {
            window.AppState.cart[existingIndex].instructions = instructions;
        }
    } else {
        window.AppState.cart.push(cartItem);
    }
    
    // Save to localStorage
    localStorage.setItem('cart', JSON.stringify(window.AppState.cart));
    
    // Update UI
    window.updateCartCount();
    window.closeModal();
    
    // Show confirmation
    window.showNotification(
        'Added to Cart',
        `${item.name} added to your cart`,
        'success'
    );
}

// Remove from cart
function removeFromCart(index) {
    const item = window.AppState.cart[index];
    window.AppState.cart.splice(index, 1);
    localStorage.setItem('cart', JSON.stringify(window.AppState.cart));
    
    window.updateCartCount();
    displayCart();
    
    window.showNotification(
        'Removed',
        `${item.name} removed from cart`,
        'info'
    );
}

// Update cart quantity
function updateCartQuantity(index, change) {
    const newQty = window.AppState.cart[index].quantity + change;
    if (newQty >= 1 && newQty <= 10) {
        window.AppState.cart[index].quantity = newQty;
        localStorage.setItem('cart', JSON.stringify(window.AppState.cart));
        displayCart();
        window.updateCartCount();
    }
}

// Display cart contents
function displayCart() {
    const container = document.getElementById('cartItems');
    if (!container) return;
    
    if (window.AppState.cart.length === 0) {
        container.innerHTML = `
            <div class="empty-cart">
                <span class="empty-icon">🛒</span>
                <h3>Your cart is empty</h3>
                <p>Browse our menu and add some delicious Swahili dishes!</p>
                <button onclick="window.showPage('menu')" class="btn-primary">
                    Browse Menu
                </button>
            </div>
        `;
        
        document.getElementById('cartSubtotal').textContent = 'KES 0';
        document.getElementById('deliveryFee').textContent = 'KES 0';
        document.getElementById('cartTax').textContent = 'KES 0';
        document.getElementById('cartTotal').textContent = 'KES 0';
        return;
    }
    
    let subtotal = 0;
    let itemsHtml = '';
    
    window.AppState.cart.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        
        itemsHtml += `
            <div class="cart-item">
                <div class="item-details">
                    <h4>${item.name}</h4>
                    <p class="item-price">${window.formatCurrency(item.price)} each</p>
                    ${item.instructions ? `<p class="item-notes">📝 ${item.instructions}</p>` : ''}
                </div>
                
                <div class="item-quantity">
                    <button class="qty-btn" onclick="updateCartQuantity(${index}, -1)">-</button>
                    <span>${item.quantity}</span>
                    <button class="qty-btn" onclick="updateCartQuantity(${index}, 1)">+</button>
                    <button class="remove-item" onclick="removeFromCart(${index})" title="Remove">
                        <span class="btn-icon">🗑️</span>
                    </button>
                </div>
                
                <div class="item-total">
                    ${window.formatCurrency(itemTotal)}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = itemsHtml;
    
    // Calculate totals
    const deliveryFee = 100; // Fixed delivery fee
    const tax = subtotal * 0.16; // 16% VAT
    const total = subtotal + deliveryFee + tax;
    
    document.getElementById('cartSubtotal').textContent = window.formatCurrency(subtotal);
    document.getElementById('deliveryFee').textContent = window.formatCurrency(deliveryFee);
    document.getElementById('cartTax').textContent = window.formatCurrency(tax);
    document.getElementById('cartTotal').textContent = window.formatCurrency(total);
}

// Show checkout page
function showCheckout() {
    if (window.AppState.cart.length === 0) {
        window.showNotification('Error', 'Your cart is empty', 'error');
        return;
    }
    
    // Pre-fill checkout with user data
    if (window.AppState.currentUser) {
        const branchSelect = document.getElementById('regBranch');
        if (branchSelect && window.AppState.currentUser.branch_id) {
            // User has preferred branch
        }
    }
    
    // Update checkout summary
    updateCheckoutSummary();
    
    window.showPage('checkout');
}

// Update checkout summary
function updateCheckoutSummary() {
    const itemCount = window.AppState.cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = window.AppState.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = document.getElementById('orderType')?.value === 'delivery' ? 100 : 0;
    const tax = subtotal * 0.16;
    const total = subtotal + deliveryFee + tax;
    
    document.getElementById('checkoutItemCount').textContent = itemCount;
    document.getElementById('checkoutTotal').textContent = window.formatCurrency(total);
}

// Toggle delivery address field
function toggleDeliveryAddress() {
    const orderType = document.getElementById('orderType').value;
    const addressGroup = document.getElementById('deliveryAddressGroup');
    
    if (orderType === 'delivery') {
        addressGroup.style.display = 'block';
        document.getElementById('deliveryAddress').required = true;
    } else {
        addressGroup.style.display = 'none';
        document.getElementById('deliveryAddress').required = false;
    }
    
    updateCheckoutSummary();
}

// Place order
async function placeOrder() {
    if (!window.AppState.currentUser) {
        window.showNotification('Error', 'Please login to place order', 'error');
        window.showPage('login');
        return;
    }
    
    // Get form data
    const orderType = document.getElementById('orderType').value;
    const deliveryAddress = document.getElementById('deliveryAddress').value;
    const deliveryNotes = document.getElementById('deliveryNotes').value;
    const specialInstructions = document.getElementById('specialInstructions').value;
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
    
    // Validate delivery address
    if (orderType === 'delivery' && !deliveryAddress) {
        window.showNotification('Error', 'Please enter delivery address', 'error');
        return;
    }
    
    // Prepare order data
    const orderData = {
        branch_id: window.AppState.currentUser.branch_id || 1, // Default to first branch
        order_type: orderType,
        delivery_address: deliveryAddress,
        delivery_notes: deliveryNotes,
        special_instructions: specialInstructions,
        payment_method: paymentMethod,
        items: window.AppState.cart.map(item => ({
            menu_item_id: item.id,
            quantity: item.quantity,
            special_requests: item.instructions
        }))
    };
    
    try {
        const data = await window.apiRequest('/api/orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
        
        // Clear cart
        window.AppState.cart = [];
        localStorage.setItem('cart', JSON.stringify([]));
        window.updateCartCount();
        
        // Show success message
        window.showNotification(
            'Order Placed! 🎉',
            `Order #${data.order_number} confirmed. Total: ${window.formatCurrency(data.total_amount)}`,
            'success'
        );
        
        // Go to orders page
        window.loadOrders();
        window.showPage('orders');
    } catch (error) {
        console.error('Order placement failed:', error);
    }
}

// Close modal
function closeModal() {
    document.getElementById('itemModal').style.display = 'none';
}

// Export functions
window.showItemModal = showItemModal;
window.adjustQuantity = adjustQuantity;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateCartQuantity = updateCartQuantity;
window.displayCart = displayCart;
window.showCheckout = showCheckout;
window.toggleDeliveryAddress = toggleDeliveryAddress;
window.placeOrder = placeOrder;
window.closeModal = closeModal;