const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Srt = sequelize.define('Srt', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  filename: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 255]
    }
  },
  updated_at: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  edited_by: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [0, 100]
    }
  }
}, {
  tableName: 'srts',
  timestamps: false, 
  hooks: {
    beforeUpdate: (srt) => {
      srt.updated_at = new Date();
    }
  }
});

module.exports = Srt;