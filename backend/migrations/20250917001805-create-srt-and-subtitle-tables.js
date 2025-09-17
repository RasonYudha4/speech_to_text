'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('srts', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      filename: {
        type: Sequelize.STRING,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      edited_by: {
        type: Sequelize.STRING,
        allowNull: true
      }
    });

    await queryInterface.createTable('subtitles', {
      sequence_number: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false
      },
      srt_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'srts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      start_time: {
        type: Sequelize.STRING,
        allowNull: false
      },
      end_time: {
        type: Sequelize.STRING,
        allowNull: false
      },
      text: {
        type: Sequelize.TEXT,
        allowNull: false
      }
    });

    await queryInterface.addConstraint('subtitles', {
      fields: ['srt_id'],
      type: 'foreign key',
      name: 'fk_subtitles_srt_id',
      references: {
        table: 'srts',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    await queryInterface.addIndex('subtitles', ['srt_id'], {
      name: 'idx_subtitles_srt_id'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeConstraint('subtitles', 'fk_subtitles_srt_id');
    
    await queryInterface.dropTable('subtitles');
    await queryInterface.dropTable('srts');
  }
};