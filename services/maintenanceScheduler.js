const schedule = require("node-schedule");
const { Kiosk } = require("../models/kiosk.model");

async function updateSchedules() {
  try {
    const currentTime = new Date();
    const kiosks = await Kiosk.find({
      $or: [
        { "maintenance.deactivateAt": { $gt: currentTime } },
        { "maintenance.activateAt": { $gt: currentTime } },
      ],
    });

    Object.keys(schedule.scheduledJobs).forEach((key) => {
      schedule.cancelJob(key);
    });

    kiosks.forEach((kiosk) => {
      if (
        kiosk.maintenance.deactivateAt &&
        kiosk.maintenance.deactivateAt > currentTime
      ) {
        schedule.scheduleJob(
          `${kiosk._id}_deactivate`,
          kiosk.maintenance.deactivateAt,
          async () => {
            try {
              await Kiosk.findByIdAndUpdate(kiosk._id, {
                isActive: false,
              });
              console.log(
                `Kiosk ${
                  kiosk.name
                } maintenance started - deactivated at ${new Date()}`
              );
            } catch (error) {
              console.error(`Failed to deactivate kiosk ${kiosk.name}:`, error);
            }
          }
        );
      }

      if (
        kiosk.maintenance.activateAt &&
        kiosk.maintenance.activateAt > currentTime
      ) {
        schedule.scheduleJob(
          `${kiosk._id}_activate`,
          kiosk.maintenance.activateAt,
          async () => {
            try {
              await Kiosk.findByIdAndUpdate(kiosk._id, {
                isActive: true,
                maintenance: {
                  deactivateAt: null,
                  activateAt: null,
                },
              });
              console.log(
                `Kiosk ${
                  kiosk.name
                } maintenance completed - activated at ${new Date()}`
              );
            } catch (error) {
              console.error(`Failed to activate kiosk ${kiosk.name}:`, error);
            }
          }
        );
      }
    });

    // console.log(
    //   `Scheduled maintenance tasks updated. Total kiosks: ${kiosks.length}`
    // );
  } catch (error) {
    console.error("Error updating schedules:", error);
  }
}

schedule.scheduleJob("0 * * * *", updateSchedules);

updateSchedules();

module.exports = { updateSchedules };
