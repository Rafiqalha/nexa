# Suricata + sidecar kontrol kecil (validate/deploy) untuk lab NEXA.
# Engine berjalan dalam mode unix-socket (tanpa capture, tanpa hak NET_ADMIN).
FROM jasonish/suricata:8.0
RUN mkdir -p /opt/nexa /var/lib/nexa-suricata
COPY deploy/suricata/nexa-suricata.sh /opt/nexa/nexa-suricata.sh
COPY deploy/suricata/control.py /opt/nexa/control.py
RUN sed -i 's/\r$//' /opt/nexa/nexa-suricata.sh /opt/nexa/control.py \
  && chmod +x /opt/nexa/nexa-suricata.sh
ENV NEXA_SURICATA_HOME=/var/lib/nexa-suricata \
    NEXA_SURICATA_WRAPPER=/opt/nexa/nexa-suricata.sh
EXPOSE 9010
ENTRYPOINT ["python3", "/opt/nexa/control.py"]
