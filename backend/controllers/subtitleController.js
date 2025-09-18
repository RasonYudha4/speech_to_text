const { validationResult } = require("express-validator");
const Srt = require("../models/Srt");
const Subtitle = require("../models/Subtitle");
const sequelize = require("../config/database");

require("../models/Association");

const subtitleController = {
  async saveSubtitles(req, res) {
    const transaction = await sequelize.transaction();

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { filename, subtitles, edited_by } = req.body;

      if (!filename || !subtitles || !Array.isArray(subtitles)) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Filename and subtitles array are required",
        });
      }

      if (subtitles.length === 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "At least one subtitle is required",
        });
      }

      // Basic structure validation - detailed validation handled by Sequelize models
      for (const subtitle of subtitles) {
        if (
          !subtitle.sequence_number ||
          !subtitle.start_time ||
          !subtitle.end_time ||
          !subtitle.text
        ) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message:
              "Each subtitle must have sequence_number, start_time, end_time, and text",
          });
        }
      }

      // Create or update SRT file
      const [srt, created] = await Srt.findOrCreate({
        where: { filename },
        defaults: {
          filename,
          edited_by,
          updated_at: new Date(),
        },
        transaction,
      });

      if (!created) {
        // Update existing SRT
        await srt.update(
          {
            edited_by,
            updated_at: new Date(),
          },
          { transaction }
        );
      }

      // Delete existing subtitles for this SRT
      await Subtitle.destroy({
        where: { srt_id: srt.id },
        transaction,
      });

      // Create new subtitles
      const subtitleData = subtitles.map((subtitle) => ({
        sequence_number: subtitle.sequence_number,
        srt_id: srt.id,
        start_time: subtitle.start_time,
        end_time: subtitle.end_time,
        text: subtitle.text,
      }));

      await Subtitle.bulkCreate(subtitleData, { transaction });

      await transaction.commit();

      // Fetch the complete data with associations
      const savedSrt = await Srt.findByPk(srt.id, {
        include: [
          {
            model: Subtitle,
            as: "subtitles",
            order: [["sequence_number", "ASC"]],
          },
        ],
      });

      res.status(201).json({
        success: true,
        message: created
          ? "SRT file and subtitles created successfully"
          : "SRT file and subtitles updated successfully",
        data: savedSrt,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("Save subtitles error:", error);

      if (error.name === "SequelizeValidationError") {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.errors.map((err) => ({
            field: err.path,
            message: err.message,
          })),
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to save subtitles",
      });
    }
  },

  async editSubtitle(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { start_time, end_time, text, userId, srt_id, sequence_number } = req.body;

      console.log("edited by : ", userId);

      if (!sequence_number) {
        return res.status(400).json({
          success: false,
          message: "Sequence number is required",
        });
      }

      if (!srt_id) {
        return res.status(400).json({
          success: false,
          message: "SRT ID is required",
        });
      }

      if (!start_time && !end_time && !text) {
        return res.status(400).json({
          success: false,
          message:
            "At least one field (start_time, end_time, or text) must be provided",
        });
      }

      // Find the subtitle by sequence_number and srt_id
      const subtitle = await Subtitle.findOne({
        where: {
          sequence_number: parseInt(sequence_number),
          srt_id: srt_id,
        },
        include: [
          {
            model: Srt,
            as: "srt",
          },
        ],
      });

      if (!subtitle) {
        return res.status(404).json({
          success: false,
          message: "Subtitle not found",
        });
      }

      // Update subtitle
      const updateData = {};
      if (start_time !== undefined) updateData.start_time = start_time;
      if (end_time !== undefined) updateData.end_time = end_time;
      if (text !== undefined) updateData.text = text;

      await subtitle.update(updateData);

      // Update corresponding SRT file
      if (userId) {
        await subtitle.srt.update({
          edited_by: userId,
          updated_at: new Date(),
        });
      }

      // Return updated subtitle
      const updatedSubtitle = await Subtitle.findOne({
        where: {
          sequence_number: parseInt(sequence_number),
          srt_id: srt_id,
        },
        include: [
          {
            model: Srt,
            as: "srt",
          },
        ],
      });

      res.status(200).json({
        success: true,
        message: "Subtitle updated successfully",
        data: updatedSubtitle,
      });
    } catch (error) {
      console.error("Edit subtitle error:", error);

      if (error.name === "SequelizeValidationError") {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.errors.map((err) => ({
            field: err.path,
            message: err.message,
          })),
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to update subtitle",
      });
    }
  },

  async getSubtitles(req, res) {
    try {
      const { filename } = req.params;

      if (!filename) {
        return res.status(400).json({
          success: false,
          message: "Filename is required",
        });
      }

      const srt = await Srt.findOne({
        where: { filename },
        include: [
          {
            model: Subtitle,
            as: "subtitles",
            order: [["sequence_number", "ASC"]],
          },
        ],
      });

      if (!srt) {
        return res.status(404).json({
          success: false,
          message: "SRT file not found",
        });
      }

      res.status(200).json({
        success: true,
        data: srt,
      });
    } catch (error) {
      console.error("Get subtitles error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve subtitles",
      });
    }
  },

  async deleteSubtitle(req, res) {
    try {
      const { sequence_number } = req.params;
      const { edited_by } = req.body;

      if (!sequence_number) {
        return res.status(400).json({
          success: false,
          message: "Sequence number is required",
        });
      }

      const subtitle = await Subtitle.findByPk(sequence_number, {
        include: [
          {
            model: Srt,
            as: "srt",
          },
        ],
      });

      if (!subtitle) {
        return res.status(404).json({
          success: false,
          message: "Subtitle not found",
        });
      }

      // Delete subtitle
      await subtitle.destroy();

      // Update corresponding SRT file
      await subtitle.srt.update({
        edited_by,
        updated_at: new Date(),
      });

      res.status(200).json({
        success: true,
        message: "Subtitle deleted successfully",
      });
    } catch (error) {
      console.error("Delete subtitle error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete subtitle",
      });
    }
  },
};

module.exports = subtitleController;
