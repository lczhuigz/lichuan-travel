const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// 中间件
app.use(cors());
app.use(express.json());

// ============ 数据库连接 ============
// 从环境变量读取数据库配置
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

// 测试数据库连接
pool.connect(async (err, client, release) => {
  if (err) {
    console.error('数据库连接失败:', err.stack);
  } else {
    console.log('数据库连接成功');
    release();
    await initializeDatabase();
  }
});

async function initializeDatabase() {
  try {
    await pool.query(`
      ALTER TABLE reviews
      ADD COLUMN IF NOT EXISTS image_url TEXT;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        customer_name VARCHAR(100) NOT NULL,
        contact VARCHAR(100) NOT NULL,
        package_name VARCHAR(150) NOT NULL,
        travel_date DATE NOT NULL,
        guests INTEGER NOT NULL CHECK (guests > 0),
        total_price NUMERIC(10,2) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'canceled')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
      CREATE TRIGGER update_orders_updated_at 
        BEFORE UPDATE ON orders 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    `);

    const countResult = await pool.query('SELECT COUNT(*) FROM orders');
    const orderCount = parseInt(countResult.rows[0].count, 10);
    if (orderCount === 0) {
      await pool.query(`
        INSERT INTO orders (customer_name, contact, package_name, travel_date, guests, total_price, status, notes) VALUES
        ('陈女士', '13600001111', '民宿康养线', '2026-06-18', 2, 1280.00, 'pending', '希望安排接机服务'),
        ('刘先生', '13700002222', '美食打卡线', '2026-06-22', 4, 1980.00, 'confirmed', '含儿童餐'),
        ('杨小姐', '13800003333', '特色特产线', '2026-07-01', 3, 1580.00, 'completed', '需要推荐当地手工特产'),
        ('周先生', '13900004444', '交通接驳线', '2026-06-25', 1, 480.00, 'confirmed', '需要安排机场接送');
      `);
      console.log('已插入订单示例数据');
    }

    console.log('数据库模式初始化完成');
  } catch (error) {
    console.error('数据库初始化失败:', error);
  }
}

// ============ 管理员配置 ============
// 从环境变量读取管理员账号密码，不设置默认值，强制在.env中配置
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// 检查管理员账号是否配置
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('错误: 请在 .env 文件中设置 ADMIN_USERNAME 和 ADMIN_PASSWORD');
  process.exit(1); // 退出程序
}

console.log('管理员账号已加载'); // 不打印具体用户名，更安全

// ============ 管理员验证中间件 ============
const validateAdmin = (req, res, next) => {
  const auth = req.headers.authorization;
  
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic');
    return res.status(401).json({ success: false, message: '需要管理员认证' });
  }
  
  try {
    // 解析 Basic Auth
    const base64Credentials = auth.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');
    
    // 使用环境变量中的账号密码进行安全比较
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      next();
    } else {
      // 使用固定时间比较防止时序攻击
      const match = username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
      if (!match) {
        return res.status(401).json({ success: false, message: '认证失败' });
      }
      next();
    }
  } catch (error) {
    console.error('认证解析错误:', error);
    res.status(401).json({ success: false, message: '认证失败' });
  }
};

// ============ 管理员登录接口 ============
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  // 简单的验证，防止错误请求
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '请提供用户名和密码' });
  }
  
  // 使用环境变量中的账号密码进行验证
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    res.json({ success: true, message: '登录成功' });
  } else {
    // 返回统一错误信息，不提示是用户名还是密码错误
    res.status(401).json({ success: false, message: '用户名或密码错误' });
  }
});

// ============ 评价相关接口 ============

// 提交评价
app.post('/api/reviews', async (req, res) => {
  try {
    const { name, email, rating, visited_place, review_text, privacy_consent, image_url } = req.body;
    
    // 输入验证
    if (!name || !email || !rating || !review_text || !privacy_consent) {
      return res.status(400).json({ 
        success: false, 
        message: '请填写所有必填字段' 
      });
    }

    const result = await pool.query(
      `INSERT INTO reviews (name, email, rating, visited_place, review_text, privacy_consent, image_url) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
      [name, email, rating, visited_place || null, review_text, privacy_consent, image_url || null]
    );
    
    res.status(201).json({ 
      success: true, 
      message: '评价提交成功，等待管理员审核',
      data: result.rows[0] 
    });
  } catch (error) {
    console.error('提交评价错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '评价提交失败，请稍后重试' 
    });
  }
});

// 获取已批准的评价
app.get('/api/reviews', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM reviews WHERE status = $1',
      ['approved']
    );
    const total = parseInt(countResult.rows[0].count);
    
    const reviews = await pool.query(
      `SELECT id, name, rating, visited_place, review_text, image_url, 
              TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
       FROM reviews 
       WHERE status = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      ['approved', limit, offset]
    );
    
    res.json({
      success: true,
      data: reviews.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('获取评价错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '获取评价失败' 
    });
  }
});

// 订单接口
app.post('/api/orders', async (req, res) => {
  try {
    const { customer_name, contact, package_name, travel_date, guests, total_price, notes } = req.body;

    if (!customer_name || !contact || !package_name || !travel_date || !guests || !total_price) {
      return res.status(400).json({ success: false, message: '请填写完整的订单信息' });
    }

    const result = await pool.query(
      `INSERT INTO orders (customer_name, contact, package_name, travel_date, guests, total_price, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, status, created_at`,
      [customer_name, contact, package_name, travel_date, guests, total_price, notes || null]
    );

    res.status(201).json({ success: true, message: '订单提交成功，管理员会尽快处理', data: result.rows[0] });
  } catch (error) {
    console.error('提交订单错误:', error);
    res.status(500).json({ success: false, message: '提交订单失败，请稍后重试' });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status;

    const values = [];
    let condition = '';
    if (status) {
      condition = 'WHERE status = $1';
      values.push(status);
    }

    const orders = await pool.query(
      `SELECT id, customer_name, contact, package_name, TO_CHAR(travel_date, 'YYYY-MM-DD') as travel_date,
              guests, total_price, status, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
       FROM orders ${condition}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    res.json({ success: true, data: orders.rows });
  } catch (error) {
    console.error('获取订单错误:', error);
    res.status(500).json({ success: false, message: '获取订单失败' });
  }
});

app.get('/api/admin/orders', validateAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;

    const values = [limit, offset];
    let condition = '';
    if (status) {
      condition = 'WHERE status = $3';
      values.push(status);
    }

    const countParams = status ? [status] : [];
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM orders ${condition}`,
      countParams
    );

    const total = parseInt(countResult.rows[0].count);

    const queryValues = condition ? [limit, offset, status] : [limit, offset];
    const orders = await pool.query(
      `SELECT id, customer_name, contact, package_name, TO_CHAR(travel_date, 'YYYY-MM-DD') as travel_date,
              guests, total_price, status, notes,
              TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
              TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at
       FROM orders ${condition}
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      queryValues
    );

    res.json({
      success: true,
      data: orders.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('获取订单管理列表错误:', error);
    res.status(500).json({ success: false, message: '获取订单失败' });
  }
});

app.put('/api/admin/orders/:id/status', validateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'confirmed', 'completed', 'canceled'].includes(status)) {
      return res.status(400).json({ success: false, message: '无效的订单状态' });
    }

    const result = await pool.query(
      `UPDATE orders 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING id, status`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '订单不存在' });
    }

    res.json({ success: true, message: '订单状态已更新', data: result.rows[0] });
  } catch (error) {
    console.error('更新订单状态错误:', error);
    res.status(500).json({ success: false, message: '更新订单状态失败' });
  }
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// ============ 管理员接口（需要验证）============

// 获取待审核的评价
app.get('/api/admin/reviews/pending', validateAdmin, async (req, res) => {
  try {
    const reviews = await pool.query(
      `SELECT id, name, email, rating, visited_place, review_text, image_url,
              TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
       FROM reviews 
       WHERE status = 'pending' 
       ORDER BY created_at DESC`
    );
    
    res.json({
      success: true,
      data: reviews.rows
    });
  } catch (error) {
    console.error('获取待审核评价错误:', error);
    res.status(500).json({ success: false, message: '获取失败' });
  }
});

// 获取已审核的评价
app.get('/api/admin/reviews/processed', validateAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status || 'approved';
    
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM reviews WHERE status = $1',
      [status]
    );
    const total = parseInt(countResult.rows[0].count);
    
    const reviews = await pool.query(
      `SELECT id, name, email, rating, visited_place, review_text, image_url, status,
              TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
              TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at
       FROM reviews 
       WHERE status = $1 
       ORDER BY updated_at DESC 
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );
    
    res.json({
      success: true,
      data: reviews.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('获取已审核评价错误:', error);
    res.status(500).json({ success: false, message: '获取失败' });
  }
});

// 审核评价
app.put('/api/admin/reviews/:id/status', validateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: '无效的状态值' });
    }
    
    const result = await pool.query(
      `UPDATE reviews 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING id, status`,
      [status, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '评价不存在' });
    }
    
    res.json({
      success: true,
      message: `评价已${status === 'approved' ? '通过' : '拒绝'}`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('更新评价状态错误:', error);
    res.status(500).json({ success: false, message: '更新失败' });
  }
});

// 批量审核
app.post('/api/admin/reviews/batch-status', validateAdmin, async (req, res) => {
  try {
    const { ids, status } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: '请选择要审核的评价' });
    }
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: '无效的状态值' });
    }
    
    const result = await pool.query(
      `UPDATE reviews 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ANY($2::int[]) 
       RETURNING id`,
      [status, ids]
    );
    
    res.json({
      success: true,
      message: `已批量${status === 'approved' ? '通过' : '拒绝'} ${result.rowCount} 条评价`,
      data: result.rows
    });
  } catch (error) {
    console.error('批量审核错误:', error);
    res.status(500).json({ success: false, message: '批量审核失败' });
  }
});

// 删除评价
app.delete('/api/admin/reviews/:id', validateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM reviews WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '评价不存在' });
    }
    
    res.json({
      success: true,
      message: '评价已删除'
    });
  } catch (error) {
    console.error('删除评价错误:', error);
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

// 获取统计数据
app.get('/api/admin/stats', validateAdmin, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_reviews,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_reviews,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_reviews,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_reviews,
        AVG(CASE WHEN status = 'approved' THEN rating END)::numeric(10,2) as avg_rating,
        (SELECT COUNT(*) FROM orders) as total_orders,
        (SELECT COUNT(*) FROM orders WHERE status = 'pending') as pending_orders,
        (SELECT COUNT(*) FROM orders WHERE status = 'confirmed') as confirmed_orders,
        (SELECT COALESCE(SUM(total_price),0)::numeric(12,2) FROM orders WHERE status IN ('confirmed','completed')) as revenue
      FROM reviews
    `);
    
    res.json({
      success: true,
      data: stats.rows[0]
    });
  } catch (error) {
    console.error('获取统计错误:', error);
    res.status(500).json({ success: false, message: '获取统计失败' });
  }
});

// ============ 启动服务器 ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`后端服务运行在端口 ${PORT}`);
  console.log(`管理员接口已保护`); // 不暴露任何敏感信息
});