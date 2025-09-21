module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("users", "provider", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("users", "providerId", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("users", "provider");
    await queryInterface.removeColumn("users", "providerId");
  },
};
