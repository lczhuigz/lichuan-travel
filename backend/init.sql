-- 创建评价表
CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    visited_place VARCHAR(100),
    review_text TEXT NOT NULL,
    privacy_consent BOOLEAN NOT NULL DEFAULT true,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC);

-- 创建更新时间的触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_reviews_updated_at ON reviews;
CREATE TRIGGER update_reviews_updated_at 
    BEFORE UPDATE ON reviews 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 插入示例数据（已批准的评价）
INSERT INTO reviews (name, email, rating, visited_place, review_text, status) VALUES
('张三', 'zhangsan@example.com', 5, '腾龙洞', '腾龙洞真是太壮观了！激光秀表演非常精彩，值得一看。', 'approved'),
('李四', 'lisi@example.com', 4, '龙船水乡', '龙船水乡风景优美，乘船游览很有特色，就是人有点多。', 'approved'),
('王五', 'wangwu@example.com', 5, '佛宝山', '佛宝山的瀑布群很美，空气清新，适合休闲度假。', 'approved'),
('赵六', 'zhaoliu@example.com', 5, '大水井古建筑群', '古建筑保存完好，很有历史感，导游讲解很详细。', 'approved'),
('钱七', 'qianqi@example.com', 4, '齐岳山', '高山草原风光独特，夏天很凉快，适合露营。', 'approved');