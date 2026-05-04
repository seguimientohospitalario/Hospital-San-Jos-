# Usar imagen oficial de Node con dependencias de Playwright
FROM mcr.microsoft.com/playwright:v1.40.0-focal

# Directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencia
COPY package*.json ./

# Instalar dependencias (solo producción para ahorrar espacio)
RUN npm install --only=production

# Copiar código fuente
COPY . .

# Exponer puerto para Koyeb
EXPOSE 10000

# Comando de inicio
CMD ["npm", "start"]
