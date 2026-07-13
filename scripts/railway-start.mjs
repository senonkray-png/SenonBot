import { execSync } from "node:child_process";

const commands = {
  bot: "npm run start:bot",
  user: "npm run start:user",
  mini: "npx serve apps/mini-app/dist --single --listen $PORT"
};

execSync(commands[getServiceRole()], { stdio: "inherit", shell: true });

function getServiceRole() {
  const role = process.env.SERVICE_ROLE?.trim().toLowerCase();

  if (role === "bot" || role === "user" || role === "mini") {
    return role;
  }

  const serviceName = process.env.RAILWAY_SERVICE_NAME?.trim().toLowerCase();

  if (serviceName === "bot-api") {
    return "bot";
  }

  if (serviceName === "user-client") {
    return "user";
  }

  if (serviceName === "mini-app") {
    return "mini";
  }

  throw new Error(
    "Set SERVICE_ROLE to one of: bot, user, mini. Railway cannot infer which app to start."
  );
}
