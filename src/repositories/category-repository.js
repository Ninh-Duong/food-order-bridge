const fs = require('fs');
const path = require('path');
const { isDBConnected } = require('../db');
const { CategoryModel } = require('../models');

const CATEGORY_FILE = path.join(__dirname, '..', 'data', 'categories.json');

class CategoryRepository {
  async getAll() {
    let categories = [];
    if (isDBConnected()) {
      try {
        categories = await CategoryModel.find().lean();
        if (!categories || categories.length === 0) {
          const defaultCategories = this.getFromFile();
          if (defaultCategories.length > 0) {
            console.log('🌱 Seeding initial categories to MongoDB...');
            await CategoryModel.insertMany(defaultCategories);
            categories = await CategoryModel.find().lean();
          }
        }
        categories = categories.map(c => this.cleanCategory(c));
      } catch (err) {
        console.error('Error fetching categories from MongoDB:', err.message);
        categories = this.getFromFile();
      }
    } else {
      categories = this.getFromFile();
    }

    return this.sortCategories(categories);
  }

  getFromFile() {
    try {
      if (fs.existsSync(CATEGORY_FILE)) {
        const raw = fs.readFileSync(CATEGORY_FILE, 'utf8');
        if (!raw || !raw.trim()) return [];
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('Error reading categories.json:', err.message);
    }
    return [];
  }

  saveAllToFile(categories) {
    fs.mkdirSync(path.dirname(CATEGORY_FILE), { recursive: true });
    const tempFile = `${CATEGORY_FILE}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    fs.writeFileSync(tempFile, JSON.stringify(categories, null, 2), 'utf8');
    try {
      fs.renameSync(tempFile, CATEGORY_FILE);
    } catch (e) {
      fs.writeFileSync(CATEGORY_FILE, JSON.stringify(categories, null, 2), 'utf8');
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
    return categories;
  }

  cleanCategory(item) {
    if (!item) return null;
    const { _id, __v, ...rest } = item;
    return { ...rest, id: rest.id || _id };
  }

  sortCategories(categories) {
    return [...categories].sort((a, b) => {
      const orderA = a.sortOrder ?? 0;
      const orderB = b.sortOrder ?? 0;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (a.name || '').localeCompare(b.name || '', 'vi');
    });
  }

  async getById(id) {
    if (!id) return null;
    const upperId = id.trim().toUpperCase();
    if (isDBConnected()) {
      try {
        const item = await CategoryModel.findOne({ id: upperId }).lean();
        if (item) return this.cleanCategory(item);
      } catch (err) {
        console.error('Error fetching category by id from MongoDB:', err.message);
      }
    }
    const categories = this.getFromFile();
    return categories.find(c => c.id === upperId) || null;
  }

  async getBySlug(slug) {
    if (!slug) return null;
    const cleanSlug = slug.trim().toLowerCase();
    if (isDBConnected()) {
      try {
        const item = await CategoryModel.findOne({ slug: cleanSlug }).lean();
        if (item) return this.cleanCategory(item);
      } catch (err) {
        console.error('Error fetching category by slug from MongoDB:', err.message);
      }
    }
    const categories = this.getFromFile();
    return categories.find(c => c.slug === cleanSlug) || null;
  }

  async findByNormalizedName(normalizedName) {
    if (!normalizedName) return null;
    const all = await this.getAll();
    return all.find(c => {
      const norm = (c.name || '').trim().replace(/\s+/g, ' ').toLowerCase();
      return norm === normalizedName;
    }) || null;
  }

  async create(categoryData) {
    const now = new Date();
    const payload = {
      ...categoryData,
      id: categoryData.id.trim().toUpperCase(),
      name: categoryData.name.trim(),
      slug: categoryData.slug.trim().toLowerCase(),
      description: categoryData.description ? categoryData.description.trim() : '',
      sortOrder: Number.isInteger(categoryData.sortOrder) && categoryData.sortOrder >= 0 ? categoryData.sortOrder : 0,
      active: categoryData.active !== undefined ? Boolean(categoryData.active) : true,
      createdAt: categoryData.createdAt || now,
      updatedAt: now
    };

    if (isDBConnected()) {
      try {
        const created = await CategoryModel.create(payload);
        return this.cleanCategory(created.toObject());
      } catch (err) {
        console.error('Error creating category in MongoDB:', err.message);
      }
    }

    const categories = this.getFromFile();
    categories.push(payload);
    this.saveAllToFile(categories);
    return payload;
  }

  async update(id, categoryData) {
    const upperId = id.trim().toUpperCase();
    const now = new Date();
    const updatePayload = {
      name: categoryData.name.trim(),
      slug: categoryData.slug.trim().toLowerCase(),
      description: categoryData.description !== undefined ? categoryData.description.trim() : '',
      sortOrder: Number.isInteger(categoryData.sortOrder) && categoryData.sortOrder >= 0 ? categoryData.sortOrder : 0,
      active: categoryData.active !== undefined ? Boolean(categoryData.active) : true,
      updatedAt: now
    };

    if (isDBConnected()) {
      try {
        const updated = await CategoryModel.findOneAndUpdate(
          { id: upperId },
          { $set: updatePayload },
          { returnDocument: 'after', runValidators: true }
        ).lean();
        if (updated) return this.cleanCategory(updated);
      } catch (err) {
        console.error('Error updating category in MongoDB:', err.message);
      }
    }

    const categories = this.getFromFile();
    const index = categories.findIndex(c => c.id === upperId);
    if (index >= 0) {
      categories[index] = { ...categories[index], ...updatePayload };
      this.saveAllToFile(categories);
      return categories[index];
    }
    return null;
  }

  async toggleActive(id, activeState) {
    const upperId = id.trim().toUpperCase();
    const now = new Date();
    if (isDBConnected()) {
      try {
        const updated = await CategoryModel.findOneAndUpdate(
          { id: upperId },
          { $set: { active: activeState, updatedAt: now } },
          { returnDocument: 'after' }
        ).lean();
        if (updated) return this.cleanCategory(updated);
      } catch (err) {
        console.error('Error toggling category active in MongoDB:', err.message);
      }
    }

    const categories = this.getFromFile();
    const category = categories.find(c => c.id === upperId);
    if (category) {
      category.active = activeState;
      category.updatedAt = now;
      this.saveAllToFile(categories);
      return category;
    }
    return null;
  }

  async resetAndSeed() {
    const defaultCategories = this.getFromFile();
    if (isDBConnected()) {
      try {
        await CategoryModel.deleteMany({});
        if (defaultCategories.length > 0) {
          console.log('🌱 Re-seeding clean categories to MongoDB...');
          await CategoryModel.insertMany(defaultCategories);
        }
      } catch (err) {
        console.error('Error resetting categories in MongoDB:', err.message);
        throw err;
      }
    } else {
      this.saveAllToFile(defaultCategories);
    }
    return defaultCategories;
  }
}

module.exports = new CategoryRepository();

