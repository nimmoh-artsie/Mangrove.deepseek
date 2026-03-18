// =============================================
// MANGROVE CAFÉ - MENU CONTROLLER
// Handle menu and categories
// =============================================

const db = require('../database');

// Get all menu items
async function getMenu(branchId = null) {
    try {
        let query = `
            SELECT 
                m.*,
                c.name as category_name,
                c.display_order as category_order,
                ma.is_available as branch_available,
                ma.special_price
            FROM menu_items m
            JOIN categories c ON m.category_id = c.id
            LEFT JOIN menu_item_availability ma ON m.id = ma.menu_item_id
            WHERE m.is_available = true
        `;
        
        const params = [];
        
        if (branchId) {
            query += ` AND (ma.branch_id = ? OR ma.branch_id IS NULL)`;
            params.push(branchId);
        }
        
        query += ` ORDER BY c.display_order, m.name`;
        
        const menu = await db.query(query, params);
        
        // Format the response
        const formattedMenu = menu.map(item => ({
            ...item,
            price: item.special_price || item.price,
            is_available: branchId ? item.branch_available : item.is_available
        }));
        
        return formattedMenu;
        
    } catch (error) {
        console.error('Get menu error:', error);
        throw error;
    }
}

// Get menu by category
async function getMenuByCategory(categoryId) {
    try {
        const menu = await db.query(
            `SELECT m.*, c.name as category_name
             FROM menu_items m
             JOIN categories c ON m.category_id = c.id
             WHERE m.category_id = ? AND m.is_available = true
             ORDER BY m.name`,
            [categoryId]
        );
        
        return menu;
        
    } catch (error) {
        console.error('Get menu by category error:', error);
        throw error;
    }
}

// Get single menu item
async function getMenuItem(itemId) {
    try {
        const item = await db.getOne(
            `SELECT m.*, c.name as category_name
             FROM menu_items m
             JOIN categories c ON m.category_id = c.id
             WHERE m.id = ?`,
            [itemId]
        );
        
        return item;
        
    } catch (error) {
        console.error('Get menu item error:', error);
        throw error;
    }
}

// Get all categories
async function getCategories() {
    try {
        const categories = await db.query(
            `SELECT * FROM categories 
             WHERE is_active = true 
             ORDER BY display_order`,
            []
        );
        
        return categories;
        
    } catch (error) {
        console.error('Get categories error:', error);
        throw error;
    }
}

// Get category with menu items
async function getCategoryWithItems(categoryId) {
    try {
        const category = await db.getOne(
            'SELECT * FROM categories WHERE id = ?',
            [categoryId]
        );
        
        if (!category) return null;
        
        const items = await getMenuByCategory(categoryId);
        
        return {
            ...category,
            items
        };
        
    } catch (error) {
        console.error('Get category with items error:', error);
        throw error;
    }
}

// Get all branches
async function getBranches() {
    try {
        const branches = await db.query(
            `SELECT id, name, location, phone, email, 
                    opening_time, closing_time, delivery_radius_km
             FROM branches 
             WHERE is_active = true
             ORDER BY name`,
            []
        );
        
        return branches;
        
    } catch (error) {
        console.error('Get branches error:', error);
        throw error;
    }
}

// Get signature dishes
async function getSignatureDishes() {
    try {
        const dishes = await db.query(
            `SELECT m.*, c.name as category_name
             FROM menu_items m
             JOIN categories c ON m.category_id = c.id
             WHERE m.is_signature = true AND m.is_available = true
             ORDER BY m.name`,
            []
        );
        
        return dishes;
        
    } catch (error) {
        console.error('Get signature dishes error:', error);
        throw error;
    }
}

// Get fresh items (smoothies, juices)
async function getFreshItems() {
    try {
        const items = await db.query(
            `SELECT m.*, c.name as category_name
             FROM menu_items m
             JOIN categories c ON m.category_id = c.id
             WHERE m.is_fresh = true AND m.is_available = true
             ORDER BY c.display_order, m.name`,
            []
        );
        
        return items;
        
    } catch (error) {
        console.error('Get fresh items error:', error);
        throw error;
    }
}

// Search menu items
async function searchMenu(searchTerm) {
    try {
        const items = await db.query(
            `SELECT m.*, c.name as category_name
             FROM menu_items m
             JOIN categories c ON m.category_id = c.id
             WHERE m.is_available = true 
               AND (m.name LIKE ? OR m.description LIKE ?)
             ORDER BY 
                CASE 
                    WHEN m.name LIKE ? THEN 1
                    WHEN m.description LIKE ? THEN 2
                    ELSE 3
                END,
                m.name`,
            [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]
        );
        
        return items;
        
    } catch (error) {
        console.error('Search menu error:', error);
        throw error;
    }
}

// Admin functions (protected)

// Add menu item (admin only)
async function addMenuItem(itemData) {
    const { category_id, name, description, price, is_signature, is_fresh, preparation_time } = itemData;
    
    try {
        const itemId = await db.insert(
            `INSERT INTO menu_items 
             (category_id, name, description, price, is_signature, is_fresh, preparation_time)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [category_id, name, description, price, is_signature || false, is_fresh || false, preparation_time || 15]
        );
        
        // Add availability for all branches
        const branches = await getBranches();
        for (const branch of branches) {
            await db.insert(
                `INSERT INTO menu_item_availability (menu_item_id, branch_id, is_available)
                 VALUES (?, ?, true)`,
                [itemId, branch.id]
            );
        }
        
        return {
            status: 201,
            message: 'Menu item added successfully',
            itemId
        };
        
    } catch (error) {
        console.error('Add menu item error:', error);
        throw error;
    }
}

// Update menu item (admin only)
async function updateMenuItem(itemId, updates) {
    const fields = [];
    const values = [];
    
    const allowedFields = ['name', 'description', 'price', 'is_signature', 'is_fresh', 'is_available', 'preparation_time'];
    
    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            fields.push(`${field} = ?`);
            values.push(updates[field]);
        }
    }
    
    if (fields.length === 0) {
        return {
            status: 400,
            error: 'No updates provided'
        };
    }
    
    values.push(itemId);
    
    try {
        await db.query(
            `UPDATE menu_items SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        
        return {
            status: 200,
            message: 'Menu item updated successfully'
        };
        
    } catch (error) {
        console.error('Update menu item error:', error);
        throw error;
    }
}

// Delete menu item (admin only)
async function deleteMenuItem(itemId) {
    try {
        await db.query('DELETE FROM menu_items WHERE id = ?', [itemId]);
        
        return {
            status: 200,
            message: 'Menu item deleted successfully'
        };
        
    } catch (error) {
        console.error('Delete menu item error:', error);
        throw error;
    }
}

// Update branch availability
async function updateBranchAvailability(menuItemId, branchId, isAvailable) {
    try {
        await db.query(
            `UPDATE menu_item_availability 
             SET is_available = ? 
             WHERE menu_item_id = ? AND branch_id = ?`,
            [isAvailable, menuItemId, branchId]
        );
        
        return {
            status: 200,
            message: 'Availability updated successfully'
        };
        
    } catch (error) {
        console.error('Update availability error:', error);
        throw error;
    }
}

module.exports = {
    getMenu,
    getMenuByCategory,
    getMenuItem,
    getCategories,
    getCategoryWithItems,
    getBranches,
    getSignatureDishes,
    getFreshItems,
    searchMenu,
    // Admin functions
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
    updateBranchAvailability
};