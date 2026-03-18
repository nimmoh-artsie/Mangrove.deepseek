-- =============================================
-- MANGROVE CAFÉ DATABASE SCHEMA
-- Authentic Swahili Cuisine - Since 2001
-- =============================================

-- Drop database if exists (for clean setup)
DROP DATABASE IF EXISTS mangrove_cafe;

-- Create fresh database
CREATE DATABASE mangrove_cafe;
USE mangrove_cafe;

-- =============================================
-- TABLE: branches
-- =============================================
CREATE TABLE branches (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(255) NOT NULL,
    phone VARCHAR(15),
    email VARCHAR(100),
    opening_time TIME DEFAULT '08:00:00',
    closing_time TIME DEFAULT '22:00:00',
    is_active BOOLEAN DEFAULT TRUE,
    delivery_radius_km DECIMAL(5,2) DEFAULT 10.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- TABLE: users
-- =============================================
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(15) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('customer', 'staff', 'rider', 'admin') DEFAULT 'customer',
    branch_id INT,
    profile_image VARCHAR(500),
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
);

-- =============================================
-- TABLE: riders (extends users)
-- =============================================
CREATE TABLE riders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT UNIQUE NOT NULL,
    branch_id INT NOT NULL,
    vehicle_type ENUM('motorcycle', 'bicycle', 'car') DEFAULT 'motorcycle',
    license_plate VARCHAR(20),
    id_number VARCHAR(20),
    is_available BOOLEAN DEFAULT TRUE,
    current_latitude DECIMAL(10, 8),
    current_longitude DECIMAL(11, 8),
    total_deliveries INT DEFAULT 0,
    rating DECIMAL(3,2) DEFAULT 5.0,
    total_ratings INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- =============================================
-- TABLE: categories
-- =============================================
CREATE TABLE categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- TABLE: menu_items
-- =============================================
CREATE TABLE menu_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    category_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    image_url VARCHAR(500),
    is_available BOOLEAN DEFAULT TRUE,
    is_signature BOOLEAN DEFAULT FALSE,
    is_fresh BOOLEAN DEFAULT FALSE,
    preparation_time INT COMMENT 'in minutes',
    calories INT,
    spice_level ENUM('mild', 'medium', 'hot') DEFAULT 'mild',
    allergens TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- =============================================
-- TABLE: menu_item_availability (branch-specific)
-- =============================================
CREATE TABLE menu_item_availability (
    id INT PRIMARY KEY AUTO_INCREMENT,
    menu_item_id INT NOT NULL,
    branch_id INT NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    available_quantity INT DEFAULT NULL,
    special_price DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    UNIQUE KEY unique_branch_item (menu_item_id, branch_id)
);

-- =============================================
-- TABLE: orders
-- =============================================
CREATE TABLE orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_number VARCHAR(20) UNIQUE NOT NULL,
    customer_id INT NOT NULL,
    branch_id INT NOT NULL,
    order_type ENUM('delivery', 'pickup') DEFAULT 'delivery',
    delivery_address TEXT,
    delivery_notes TEXT,
    subtotal DECIMAL(10, 2) NOT NULL,
    delivery_fee DECIMAL(10, 2) DEFAULT 0,
    tax DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL,
    payment_method ENUM('mpesa', 'cash', 'card') DEFAULT 'mpesa',
    payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
    order_status ENUM(
        'pending', 
        'confirmed', 
        'preparing', 
        'ready', 
        'out_for_delivery', 
        'delivered', 
        'cancelled',
        'refunded'
    ) DEFAULT 'pending',
    special_instructions TEXT,
    estimated_pickup_time TIMESTAMP NULL,
    estimated_delivery_time TIMESTAMP NULL,
    actual_delivery_time TIMESTAMP NULL,
    cancellation_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- =============================================
-- TABLE: order_items
-- =============================================
CREATE TABLE order_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    menu_item_id INT NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    special_requests TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

-- =============================================
-- TABLE: order_tracking
-- =============================================
CREATE TABLE order_tracking (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    status VARCHAR(50) NOT NULL,
    location VARCHAR(255),
    notes TEXT,
    updated_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id)
);

-- =============================================
-- TABLE: deliveries
-- =============================================
CREATE TABLE deliveries (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT UNIQUE NOT NULL,
    rider_id INT,
    assigned_at TIMESTAMP NULL,
    picked_up_at TIMESTAMP NULL,
    delivered_at TIMESTAMP NULL,
    estimated_pickup_time TIMESTAMP NULL,
    estimated_delivery_time TIMESTAMP NULL,
    actual_delivery_time TIMESTAMP NULL,
    delivery_status ENUM(
        'pending',
        'assigned', 
        'rider_assigned',
        'rider_at_restaurant',
        'picked_up',
        'en_route',
        'nearby',
        'delivered',
        'failed'
    ) DEFAULT 'pending',
    pickup_address TEXT,
    delivery_address TEXT,
    delivery_notes TEXT,
    customer_phone VARCHAR(15),
    route_polyline TEXT,
    distance_km DECIMAL(5,2),
    duration_minutes INT,
    rider_rating INT CHECK (rider_rating BETWEEN 1 AND 5),
    customer_feedback TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (rider_id) REFERENCES riders(id)
);

-- =============================================
-- TABLE: delivery_tracking (GPS points)
-- =============================================
CREATE TABLE delivery_tracking (
    id INT PRIMARY KEY AUTO_INCREMENT,
    delivery_id INT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    speed DECIMAL(5,2),
    heading INT,
    accuracy DECIMAL(5,2),
    battery_level INT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE
);

-- =============================================
-- TABLE: notifications
-- =============================================
CREATE TABLE notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    type ENUM(
        'order_confirmation',
        'order_status',
        'payment_received',
        'rider_assigned',
        'rider_arriving',
        'delivery_update',
        'order_ready',
        'promotion',
        'system_alert'
    ) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSON,
    is_read BOOLEAN DEFAULT FALSE,
    is_clicked BOOLEAN DEFAULT FALSE,
    image_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_read (user_id, is_read),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =============================================
-- TABLE: notification_templates
-- =============================================
CREATE TABLE notification_templates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    type VARCHAR(50) NOT NULL,
    channel ENUM('sms', 'whatsapp', 'email', 'in_app') DEFAULT 'in_app',
    subject VARCHAR(255),
    template TEXT NOT NULL,
    variables JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- TABLE: payments
-- =============================================
CREATE TABLE payments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method ENUM('mpesa', 'cash', 'card') NOT NULL,
    transaction_id VARCHAR(100),
    mpesa_code VARCHAR(20),
    phone_number VARCHAR(15),
    status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    payment_date TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- =============================================
-- TABLE: reviews
-- =============================================
CREATE TABLE reviews (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT UNIQUE NOT NULL,
    user_id INT NOT NULL,
    menu_item_id INT,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    images JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

-- =============================================
-- TABLE: carts (for abandoned cart recovery)
-- =============================================
CREATE TABLE carts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    session_id VARCHAR(100),
    items JSON NOT NULL,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =============================================
-- INSERT SAMPLE DATA
-- =============================================

-- Insert branches
INSERT INTO branches (name, location, phone, email) VALUES
('Ongata Rongai', 'Ongata Rongai Town, Next to Shell Petrol Station', '0712345678', 'rongai@mangrovecafe.co.ke'),
('Lang''ata', 'Lang''ata Road, Opposite Galleria Mall', '0723456789', 'langata@mangrovecafe.co.ke');

-- Insert categories
INSERT INTO categories (name, description, display_order) VALUES
('Signature Swahili Dishes', 'Our authentic Swahili specialties passed down for generations', 1),
('Fresh Fruit Smoothies', 'Blended with real tropical ingredients for natural flavor', 2),
('Fresh Pressed Juices', 'Made from ripe, seasonal fruits with no added sugar', 3),
('Grill & BBQ', 'Perfectly grilled meats with traditional spices', 4),
('Swahili Breakfast', 'Start your day with authentic coastal breakfast', 5),
('Desserts', 'Traditional Swahili sweets and modern desserts', 6),
('Hot Beverages', 'Freshly brewed Kenyan coffee and teas', 7),
('Cold Drinks', 'Refreshing beverages to quench your thirst', 8);

-- Insert menu items
INSERT INTO menu_items (category_id, name, description, price, is_signature, is_fresh, preparation_time) VALUES
-- Signature Swahili Dishes
(1, 'Biriani ya Kuku', 'Fragrant spiced rice with tender chicken, served with kachumbari', 650.00, TRUE, FALSE, 25),
(1, 'Biriani ya Nyama', 'Spiced rice with beef, served with kachumbari and yogurt', 750.00, TRUE, FALSE, 30),
(1, 'Pilau wa Nyama', 'Traditional spiced rice with beef, Swahili style', 550.00, TRUE, FALSE, 20),
(1, 'Mishkaki', 'Grilled marinated beef skewers with chapati', 600.00, TRUE, FALSE, 20),
(1, 'Samaki wa Kupaka', 'Grilled fish in coconut sauce, served with rice', 850.00, TRUE, FALSE, 25),
(1, 'Viazi Karai', 'Crispy potato bites with spices', 350.00, FALSE, FALSE, 15),

-- Fresh Fruit Smoothies
(2, 'Tropical Mango Smoothie', 'Fresh mango blended with yogurt and honey', 320.00, FALSE, TRUE, 8),
(2, 'Strawberry Banana Smoothie', 'Sweet strawberries and creamy bananas', 320.00, FALSE, TRUE, 8),
(2, 'Passion Fruit Smoothie', 'Tangy passion fruit with pineapple', 340.00, FALSE, TRUE, 8),
(2, 'Mixed Berry Blast', 'Strawberries, blueberries, and raspberries', 380.00, FALSE, TRUE, 8),

-- Fresh Pressed Juices
(3, 'Fresh Mango Juice', 'Ripe mangoes, no sugar added', 250.00, FALSE, TRUE, 5),
(3, 'Fresh Passion Juice', 'Fresh passion fruit pulp', 280.00, FALSE, TRUE, 5),
(3, 'Watermelon Cooler', 'Chilled watermelon juice with mint', 230.00, FALSE, TRUE, 5),
(3, 'Pineapple Zinger', 'Fresh pineapple with ginger', 260.00, FALSE, TRUE, 5),
(3, 'Mixed Fruit Medley', 'Orange, pineapple, and carrot', 300.00, FALSE, TRUE, 7),

-- Grill & BBQ
(4, 'Nyama Choma (½ kg)', 'Grilled beef ribs with kachumbari and ugali', 1200.00, TRUE, FALSE, 30),
(4, 'Grilled Chicken (¼)', 'Quarter chicken grilled to perfection', 450.00, FALSE, FALSE, 20),
(4, 'Grilled Tilapia', 'Whole tilapia with grilled vegetables', 800.00, TRUE, FALSE, 25),
(4, 'BBQ Pork Ribs', 'Slow-cooked pork ribs in BBQ sauce', 950.00, FALSE, FALSE, 35),

-- Swahili Breakfast
(5, 'Mahamri na Maharagwe', 'Swahili donuts with coconut bean stew', 350.00, TRUE, FALSE, 15),
(5, 'Viazi Karai Breakfast', 'Potato bites with tea', 300.00, FALSE, FALSE, 12),
(5, 'Masala Tea Omelette', 'Spiced omelette with chapati and tea', 380.00, FALSE, FALSE, 15),
(5, 'Ndizi na Nyama', 'Green bananas cooked with beef', 450.00, TRUE, FALSE, 20),

-- Desserts
(6, 'Swahili Doughnuts (3pcs)', 'Traditional mahamri with sugar glaze', 150.00, TRUE, FALSE, 10),
(6, 'Coconut Pudding', 'Creamy rice pudding with coconut', 280.00, TRUE, FALSE, 5),
(6, 'Fruit Salad', 'Fresh seasonal fruits', 300.00, FALSE, TRUE, 8),
(6, 'Chocolate Samosas', 'Crispy samosas with chocolate filling', 200.00, FALSE, FALSE, 12),

-- Hot Beverages
(7, 'Swahili Tea (Chai)', 'Traditional spiced tea with milk', 120.00, TRUE, FALSE, 5),
(7, 'Kenyan Coffee', 'Freshly brewed AA coffee', 180.00, FALSE, FALSE, 5),
(7, 'Masala Chai', 'Extra spiced tea', 140.00, TRUE, FALSE, 5),
(7, 'Hot Chocolate', 'Rich hot chocolate with marshmallows', 220.00, FALSE, FALSE, 5),

-- Cold Drinks
(8, 'Mango Lassi', 'Mango yogurt drink', 280.00, FALSE, TRUE, 5),
(8, 'Fresh Lime Soda', 'Lime juice with soda', 180.00, FALSE, TRUE, 3),
(8, 'Iced Coffee', 'Chilled coffee with cream', 250.00, FALSE, FALSE, 5),
(8, 'Mineral Water (1L)', 'Pure drinking water', 100.00, FALSE, FALSE, 1);

-- Set availability for both branches
INSERT INTO menu_item_availability (menu_item_id, branch_id, is_available)
SELECT id, 1, TRUE FROM menu_items
UNION ALL
SELECT id, 2, TRUE FROM menu_items;

-- Insert sample users
-- Password for all is 'password123' (will be hashed in app)
INSERT INTO users (name, phone, email, password_hash, role, branch_id) VALUES
('Neema Ng''ang''a', '0700111111', 'neema@example.com', '$2a$10$dummyhashnotrealsecure', 'admin', 1),
('John Mwangi', '0711111111', 'john.rider@example.com', '$2a$10$dummyhashnotrealsecure', 'rider', 1),
('Peter Omondi', '0722222222', 'peter.rider@example.com', '$2a$10$dummyhashnotrealsecure', 'rider', 1),
('Mary Wanjiku', '0733333333', 'mary.rider@example.com', '$2a$10$dummyhashnotrealsecure', 'rider', 2),
('Ahmed Hassan', '0744444444', 'ahmed@example.com', '$2a$10$dummyhashnotrealsecure', 'customer', NULL),
('Fatma Said', '0755555555', 'fatma@example.com', '$2a$10$dummyhashnotrealsecure', 'customer', NULL),
('James Kariuki', '0766666666', 'james@example.com', '$2a$10$dummyhashnotrealsecure', 'staff', 1),
('Lucy Akinyi', '0777777777', 'lucy@example.com', '$2a$10$dummyhashnotrealsecure', 'staff', 2);

-- Insert riders
INSERT INTO riders (user_id, branch_id, vehicle_type, license_plate, id_number) VALUES
(2, 1, 'motorcycle', 'KME 123A', '12345678'),
(3, 1, 'bicycle', NULL, '23456789'),
(4, 2, 'motorcycle', 'KME 456B', '34567890');

-- Insert notification templates
INSERT INTO notification_templates (type, channel, subject, template, variables) VALUES
('order_confirmation', 'sms', 'Order Confirmed', 
 'Mangrove Café: Your order #{order_number} has been confirmed. Total: KES {total}. Thank you for choosing authentic Swahili cuisine!',
 '["order_number","total"]'),
 
('order_confirmation', 'in_app', 'Order Confirmed', 
 '✅ Order #{order_number} confirmed. We''ll notify you when it''s ready!',
 '["order_number"]'),

('rider_assigned', 'sms', 'Rider Assigned', 
 'Mangrove Café: Your rider {rider_name} ({rider_phone}) has been assigned. Track live at: {tracking_url}',
 '["rider_name","rider_phone","tracking_url"]'),

('rider_arriving', 'whatsapp', 'Rider Nearby', 
 '🍽️ *Mangrove Café*\nYour food is almost there! {rider_name} is {distance} minutes away. Please be ready to receive your order.',
 '["rider_name","distance"]'),

('order_ready', 'in_app', 'Order Ready', 
 '🎉 Your order #{order_number} is ready for pickup!',
 '["order_number"]'),

('delivery_update', 'in_app', 'Delivery Update', 
 '{message}',
 '["message"]');

-- Insert sample order (for testing)
INSERT INTO orders (
    order_number, customer_id, branch_id, order_type, 
    delivery_address, subtotal, delivery_fee, total_amount,
    payment_method, payment_status, order_status
) VALUES (
    'ORD-20240315-001', 5, 1, 'delivery',
    '123 Kenyatta Ave, Ongata Rongai', 1250.00, 100.00, 1350.00,
    'mpesa', 'paid', 'delivered'
);

INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, subtotal) VALUES
(1, 2, 1, 750.00, 750.00),  -- Biriani ya Nyama
(1, 9, 2, 250.00, 500.00);   -- Fresh Mango Juice

INSERT INTO order_tracking (order_id, status, notes) VALUES
(1, 'pending', 'Order received'),
(1, 'confirmed', 'Order confirmed by staff'),
(1, 'preparing', 'Kitchen started preparation'),
(1, 'ready', 'Order ready for pickup/delivery'),
(1, 'out_for_delivery', 'Rider assigned'),
(1, 'delivered', 'Order delivered successfully');

-- Create indexes for performance
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_branch ON orders(branch_id);
CREATE INDEX idx_orders_status ON orders(order_status);
CREATE INDEX idx_orders_date ON orders(created_at);
CREATE INDEX idx_menu_items_category ON menu_items(category_id);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX idx_deliveries_rider ON deliveries(rider_id);
CREATE INDEX idx_deliveries_status ON deliveries(delivery_status);

-- Create view for order summary
CREATE VIEW order_summary AS
SELECT 
    o.id,
    o.order_number,
    o.customer_id,
    u.name AS customer_name,
    u.phone AS customer_phone,
    o.branch_id,
    b.name AS branch_name,
    o.order_type,
    o.total_amount,
    o.order_status,
    o.payment_status,
    o.created_at,
    r.name AS rider_name,
    d.delivery_status
FROM orders o
JOIN users u ON o.customer_id = u.id
JOIN branches b ON o.branch_id = b.id
LEFT JOIN deliveries d ON o.id = d.order_id
LEFT JOIN riders r ON d.rider_id = r.id
LEFT JOIN users ru ON r.user_id = ru.id;

-- Create function to generate order number
DELIMITER $$
CREATE FUNCTION generate_order_number() 
RETURNS VARCHAR(20)
DETERMINISTIC
BEGIN
    DECLARE new_number VARCHAR(20);
    SET new_number = CONCAT('ORD-', DATE_FORMAT(NOW(), '%Y%m%d'), '-', LPAD(FLOOR(RAND() * 1000), 3, '0'));
    RETURN new_number;
END$$
DELIMITER ;

-- Create trigger for order number
DELIMITER $$
CREATE TRIGGER before_insert_orders
BEFORE INSERT ON orders
FOR EACH ROW
BEGIN
    IF NEW.order_number IS NULL THEN
        SET NEW.order_number = CONCAT('ORD-', DATE_FORMAT(NOW(), '%Y%m%d'), '-', LPAD(FLOOR(RAND() * 1000), 3, '0'));
    END IF;
END$$
DELIMITER ;

-- Create event to clean old notifications (optional)
DELIMITER $$
CREATE EVENT clean_old_notifications
ON SCHEDULE EVERY 1 DAY
DO
BEGIN
    DELETE FROM notifications 
    WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
    AND is_read = TRUE;
END$$
DELIMITER ;

-- Enable event scheduler
SET GLOBAL event_scheduler = ON;

-- Show summary
SELECT '✅ Mangrove Café Database Created Successfully!' AS Message;
SELECT CONCAT('📊 Tables Created: ', COUNT(*)) AS Summary FROM information_schema.tables WHERE table_schema = 'mangrove_cafe';